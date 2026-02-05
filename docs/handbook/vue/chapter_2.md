# 第2章 响应式系统的设计与实现

> **摘要**：Vue.js的核心竞争力之一在于其优雅的响应式系统，这一系统使得开发者只需关注数据的变化，而无需手动操作DOM来更新视图。Vue 3对响应式系统进行了彻底重构，从Vue 2基于`Object.defineProperty`的实现迁移至基于ES6 Proxy的新方案，带来了性能提升、功能增强和更好的TypeScript支持。本章将从依赖收集机制、观察者模式应用、数据劫持实现、双向引用机制、数组特殊处理以及性能优化六个维度，深入剖析Vue 3响应式系统的设计原理与实现细节。

## 2.1 依赖收集机制的工作原理与源码解析

### 2.1.1 依赖收集的核心概念

依赖收集是响应式系统的基石，它解决了"当数据变化时，如何精确知道哪些视图或计算需要更新"这一核心问题。在传统的MVVM模式中，如果采用"拉取式"（Pull-based）策略，每次数据变化时都需要遍历所有可能的依赖关系来判断哪些需要更新，这种方式效率极低。而Vue采用的是"推送式"（Push-based）策略，通过依赖收集机制建立数据与消费者之间的精确映射关系，实现精准更新。

Vue 3的依赖收集机制主要依赖三个核心角色：Target（目标函数，也称为activeEffect）、Dep（依赖收集器）和TargetMap（目标映射表）。当响应式对象的属性被访问时，系统会记录下当前正在执行的函数；当该属性被修改时，系统能够根据之前的记录精准地通知所有需要更新的函数。这种设计使得响应式更新不再是全量扫描，而是精确的定向通知。

在Vue 3的实现中，依赖收集发生在Proxy的get拦截器中。当读取响应式对象的某个属性时，getter函数会调用`track`函数来收集依赖；而当属性被修改时，setter函数会调用`trigger`函数来触发更新。这种设计将数据的变化与视图的更新完美地解耦，开发者只需修改数据，Vue会自动处理后续的更新逻辑。

### 2.1.2 Target与TargetMap的数据结构设计

Target（当前活跃的副作用函数）是依赖收集的起点。Vue 3使用一个全局变量`activeEffect`来追踪当前正在执行的副作用函数。当一个副作用函数开始执行时，它会将自己的引用赋值给`activeEffect`；执行完毕后，再将`activeEffect`重置为`null`。这种设计确保了在依赖收集的过程中，系统始终知道"是谁在访问响应式数据"。

```javascript
// 简化的activeEffect管理实现
let activeEffect = null;
const effectStack = [];

function effect(fn) {
  const effect = createReactiveEffect(fn);
  effect(); // 立即执行一次，收集依赖
  return effect;
}

function createReactiveEffect(fn) {
  const effect = function reactiveEffect() {
    try {
      effectStack.push(effect);
      activeEffect = effect;
      return fn(); // 执行用户函数，此时访问响应式数据会触发依赖收集
    } finally {
      effectStack.pop();
      activeEffect = effectStack[effectStack.length - 1] || null;
    }
  };
  effect.deps = []; // 存储该effect依赖的所有dep
  return effect;
}
```

TargetMap是Vue 3依赖存储的核心数据结构，它使用WeakMap作为外层映射，以原始对象（target）为键，内部使用Map存储属性名（key）到依赖集合（Set<effect>）的映射。这种设计有三重考量：首先，WeakMap的键是弱引用，不会阻止垃圾回收，避免了内存泄漏问题；其次，使用Map而非普通对象可以支持任意类型的键，包括Symbol；第三，使用Set而非数组可以自动去重，避免重复添加相同的依赖。

```javascript
// TargetMap的三层数据结构
const targetMap = new WeakMap();
// 结构示例：
// targetMap: WeakMap<target, Map<key, Set<effect>>>
// {
//   {obj}: Map {
//     'count': Set [effect1, effect2],
//     'name': Set [effect3]
//   }
// }
```

这种数据结构的设计充分体现了Vue 3对性能和内存的极致追求。当处理10,000个响应式对象时，使用WeakMap + WeakSet构建的依赖关系图使得内存回收效率显著提升，内存占用从Vue 2的32MB降至约19MB。

### 2.1.3 track函数的实现原理

`track`函数是依赖收集的核心执行者，它的职责是将当前活跃的副作用函数（activeEffect）与被访问的目标属性建立关联。在Vue 3的源码中，`track`函数的实现如下：

```javascript
// 简化的track函数实现
function track(target, key) {
  // 获取当前活跃的副作用函数
  const effect = activeEffect;
  if (!effect) return; // 如果没有活跃的effect，直接返回

  // 构建依赖关系
  let depsMap = targetMap.get(target);
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()));
  }

  let dep = depsMap.get(key);
  if (!dep) {
    depsMap.set(key, (dep = new Set()));
  }

  // 将当前effect添加到该属性的依赖集合中
  dep.add(effect);

  // 反向记录：该effect依赖于哪些dep（用于后续清理）
  effect.deps.push(dep);
}
```

`track`函数的设计体现了几个重要的工程考量。第一，它在添加依赖之前会检查`activeEffect`是否存在，这是因为在组件初始化阶段或异步更新阶段，可能没有正在执行的副作用函数，此时不需要进行依赖收集。第二，使用`dep.add(effect)`而不是数组的push方法，这是因为Set会自动去重，避免同一个副作用函数被重复添加到同一个属性的依赖集合中。第三，建立了双向引用关系：dep中存储了effect的引用，effect.deps中存储了所有相关dep的引用，这种设计为后续的依赖清理提供了便利。

### 2.1.4 trigger函数的更新触发机制

与`track`函数相对应，`trigger`函数负责在数据变化时触发所有依赖该数据的副作用函数。它的执行流程包括：获取目标属性对应的依赖集合、去重处理、按需执行副作用。

```javascript
// 简化的trigger函数实现
function trigger(target, key) {
  // 获取该目标对象的所有依赖映射
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  // 获取该属性的所有依赖函数
  const effects = depsMap.get(key);
  if (!effects) return;

  // 遍历执行所有依赖函数
  effects.forEach((effect) => {
    // 如果有调度器，使用调度器控制执行时机
    if (effect.scheduler) {
      effect.scheduler();
    } else {
      effect();
    }
  });
}
```

在Vue 3的实际实现中，`trigger`函数还包含了更复杂的逻辑，包括处理数组的特殊情况（如length属性的变化）、支持批量更新、避免在执行过程中产生递归调用等。特别值得注意的是，Vue 3使用了Set来存储依赖函数，这天然地解决了重复执行的问题——即使某个属性被多次修改，同一个副作用函数也只会执行一次。

根据Vue官方文档的性能测试数据，使用Proxy实现的响应式系统在直接修改大型对象时确实比Vue 2的Object.defineProperty方案慢2-3倍，但由于组件渲染优化和批量更新机制，整体应用性能通常仍优于Vue 2。在NextTick异步操作场景下，Vue 3甚至表现出5%-35%的性能优势。

---

## 2.2 观察者模式在Vue中的具体应用

### 2.2.1 观察者模式的理论基础与前端应用

观察者模式（Observer Pattern）是一种行为型设计模式，定义了对象之间的一对多依赖关系，当一个对象的状态发生改变时，所有依赖于它的对象都会自动收到通知并更新。在前端开发领域，观察者模式有着广泛的应用场景：事件处理系统、状态管理库、响应式框架等都以观察者模式为核心构建。

Vue的响应式系统本质上是观察者模式的精细化实现。在经典的观察者模式中，有两个核心角色：Subject（主题/被观察者）和Observer（观察者）。Subject维护一个观察者列表，提供订阅和取消订阅的方法，以及状态变化时通知所有观察者的能力。Observer定义一个更新接口，接收Subject的通知并执行相应的操作。

然而，Vue的响应式系统对经典观察者模式进行了重要的扩展和改进。在Vue中，Dep扮演了Subject的角色，负责维护依赖列表和通知更新；而Watcher则扮演了Observer的角色，但它不仅是被动等待通知的执行单元，还负责主动收集依赖。这种设计上的变化使得Vue的响应式系统更加灵活和高效。

### 2.2.2 Dep类的设计与实现

Dep（Dependency）是Vue响应式系统中依赖管理的核心类。在Vue 3中，虽然具体的类名和实现细节有所变化，但其核心职责保持不变：管理某个响应式属性的所有依赖（订阅者），并在属性变化时通知它们更新。

```javascript
// Dep类的简化实现
class Dep {
  constructor() {
    this.subscribers = new Set(); // 使用Set避免重复订阅
  }

  depend() {
    // 将当前活跃的副作用函数添加到订阅者列表
    if (activeEffect) {
      this.subscribers.add(activeEffect);
    }
  }

  notify() {
    // 通知所有订阅者更新
    this.subscribers.forEach((subscriber) => {
      if (subscriber.scheduler) {
        subscriber.scheduler();
      } else {
        subscriber();
      }
    });
  }
}
```

Dep类的设计体现了几个重要的工程原则。首先，使用Set而非数组来存储订阅者，Set的自动去重特性避免了同一副作用函数被重复添加到同一个Dep实例中，这在频繁更新场景下尤为重要。其次，`depend`和`notify`方法分离了依赖收集和更新通知的职责，使得代码结构更加清晰。第三，Dep实例与特定的目标对象属性关联，每个响应式属性都有自己独立的Dep实例，这确保了依赖关系的精确性。

在Vue 3的实际实现中，Dep类还包含了一些额外的特性，如收集调试信息、支持只读模式、处理集合类型等。但其核心设计理念与上述简化版本是一致的：通过维护一个订阅者集合，在数据变化时精确通知所有需要更新的消费者。

### 2.2.3 Watcher模式的深度实现

Watcher是Vue响应式系统中连接数据与视图的桥梁。在Vue 3中，Watcher的概念被泛化为"副作用函数"（effect），但其核心职责保持不变：执行用户提供的回调函数，收集该函数执行过程中访问的所有响应式数据的依赖，并在这些数据变化时重新执行。

```javascript
// Watcher/effect的简化实现
class Watcher {
  constructor(fn, options = {}) {
    this.fn = fn;
    this.deps = []; // 反向记录：此Watcher依赖的所有Dep
    this.value = undefined;

    // 执行函数以收集依赖
    this.update();
  }

  update() {
    // 清理旧的依赖关系
    this.cleanupDeps();

    // 设置当前活跃的Watcher
    activeEffect = this;

    // 执行用户函数，触发依赖收集
    try {
      this.value = this.fn();
    } finally {
      activeEffect = null;
    }
  }

  cleanupDeps() {
    // 清理此Watcher不再依赖的Dep中的引用
    this.deps.forEach((dep) => {
      dep.subscribers.delete(this);
    });
    this.deps = [];
  }

  // 当依赖的数据变化时，此方法会被调用
  onDependencyChanged() {
    // 重新执行用户函数
    this.update();
  }
}
```

Watcher类的设计实现了依赖关系的动态管理。每次Watcher执行之前，它会先清理之前建立的所有依赖关系，然后重新执行用户函数并收集新的依赖。这种"先清理、后建立"的策略确保了依赖关系的准确性：只有当前正在执行的函数所依赖的数据才会被追踪，而那些曾经依赖但现在已经不再使用的数据会被及时清理。

在Vue 3的实现中，Watcher还支持多种类型，包括渲染Watcher（render watcher）、计算属性Watcher（computed watcher）和用户Watcher（user watcher）。每种类型的Watcher有不同的行为特征：渲染Watcher负责组件的重新渲染，计算属性Watcher具有缓存机制以避免不必要的重复计算，用户Watcher则提供更灵活的API供开发者使用。

### 2.2.4 Observer、Dep与Watcher的协作流程

Vue响应式系统的三个核心角色——Observer、Dep和Watcher——通过紧密的协作实现了数据的自动响应。整个协作流程可以分为初始化阶段和更新阶段两个主要部分。

在初始化阶段，系统首先会创建响应式对象（通过`reactive`函数），此时Observer开始工作，将普通对象转换为Proxy代理对象。接下来，当组件渲染或计算属性求值时，Watcher开始执行，访问响应式对象的属性。在属性访问的过程中，Proxy的get拦截器被触发，它调用`track`函数将当前活跃的Watcher添加到该属性对应的Dep的订阅者列表中。

```javascript
// 完整的协作流程示例
const { reactive, effect } = Vue;

// 1. 创建响应式对象
const state = reactive({
  count: 0,
  name: "Vue",
});

// 2. 创建Watcher（副作用函数）
effect(() => {
  console.log(`Count is: ${state.count}, Name is: ${state.name}`);
});

// 3. 依赖收集过程
// 当执行effect时：
// - 访问 state.count → 触发 get 拦截器 → track('count') → Dep.count.add(effect)
// - 访问 state.name  → 触发 get 拦截器 → track('name')  → Dep.name.add(effect)

// 4. 更新触发过程
state.count = 1; // 触发 set 拦截器 → trigger('count') → Dep.count 中的所有 effect 执行
state.name = "Vue3"; // 触发 set 拦截器 → trigger('name') → Dep.name 中的所有 effect 执行
```

这种协作模式的优势在于精确性和效率的平衡。与传统的脏检查（dirty checking）机制相比，Vue的响应式系统能够精确地知道哪些数据变化影响了哪些视图更新，避免了不必要的计算和渲染。与轮询机制相比，Vue的推送式更新能够立即响应数据变化，提供更好的用户体验。

根据Vue官方文档的说明，响应式系统的工作流程遵循以下步骤：首先，在初始化阶段创建响应式对象并设置Proxy拦截器；然后，在依赖收集阶段，通过getter建立target→key→effect的映射关系；接着，在更新触发阶段，setter通过映射找到对应的effects，通过调度器批量执行；最后，在清理阶段，effect重新执行前清理旧依赖，避免无效更新。

---

## 2.3 数据劫持的底层实现与Proxy vs Object.defineProperty对比

### 2.3.1 数据劫持的概念与演进

数据劫持（Data Interception）是实现响应式系统的核心技术之一，其基本原理是在数据的访问和修改操作上"插入"自定义的逻辑，从而实现对数据变化的监控和响应。在Vue的发展历程中，数据劫持的实现方式经历了从`Object.defineProperty`到ES6 Proxy的重大转变，这一转变不仅解决了Vue 2时代的多项痛点，也为Vue 3带来了更好的性能和更强大的功能。

数据劫持的核心价值在于实现了数据与视图的自动同步。当开发者修改数据时，框架能够自动检测到这一变化并执行相应的更新逻辑，无需手动操作DOM或调用更新函数。这种声明式的编程范式大大简化了前端开发的复杂性，使得开发者可以专注于业务逻辑本身。

在Vue 2中，数据劫持通过`Object.defineProperty`实现。每个响应式对象的属性都会被转换为一个带有getter和setter的访问器属性，当属性被读取时触发getter，被修改时触发setter。Vue在getter中收集依赖，在setter中通知更新，从而实现了响应式系统的核心功能。

然而，`Object.defineProperty`存在一些固有的局限性。首先，它只能劫持已存在的属性，对于后续动态添加的属性无能为力；其次，它无法直接监听数组的变化，需要通过重写数组方法来实现；第三，它需要递归遍历对象的所有嵌套属性，性能开销较大。这些问题在Vue 3中通过引入Proxy得到了根本性的解决。

### 2.3.2 Object.defineProperty的实现原理与局限

`Object.defineProperty`是ES5引入的方法，允许精确控制对象属性的特性。通过这个方法，开发者可以定义属性的getter和setter函数，从而实现对属性访问和修改的拦截。

```javascript
// Object.defineProperty实现数据劫持的基本模式
function defineReactive(obj, key, value) {
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      console.log(`读取属性 ${key}: ${value}`);
      return value;
    },
    set(newValue) {
      if (newValue !== value) {
        console.log(`设置属性 ${key}: ${newValue}`);
        value = newValue;
        // 触发更新通知
      }
    },
  });
}

// 使用示例
const data = {};
defineReactive(data, "count", 0);
data.count; // 输出: 读取属性 count: 0
data.count = 1; // 输出: 设置属性 count: 1
```

尽管`Object.defineProperty`在Vue 2中发挥了重要作用，但它存在几个关键的局限性。第一个局限性是无法检测新属性的添加。`Object.defineProperty`只能对已存在的属性进行劫持，当开发者动态添加新属性时，Vue无法自动将其转换为响应式。这就是为什么在Vue 2中需要使用`Vue.set`或`this.$set`来添加新属性的原因。

```javascript
// Vue 2中的问题：新属性无法响应
const vm = new Vue({
  data: { obj: {} },
});
vm.obj.newProp = "Hello"; // ❌ 不会触发响应式更新
vm.$set(vm.obj, "newProp", "Hello"); // ✅ 才会触发响应式更新
```

第二个局限性是数组监听的不完善。Vue 2无法通过`Object.defineProperty`监听数组索引的变化，因为数组的长度是不确定的，为每个数组元素都创建getter和setter会造成巨大的性能开销。因此，Vue 2选择重写数组的七个方法（push、pop、shift、unshift、splice、sort、reverse）来间接实现响应式。

```javascript
// Vue 2中数组监听的问题
const arr = [1, 2, 3];
arr[0] = 99; // ❌ 不会触发响应式更新（索引变化）
arr.push(4); // ✅ 会触发响应式更新（重写的方法）
```

第三个局限性是深层嵌套对象的性能问题。当对象的嵌套层级较深时，`Object.defineProperty`需要递归遍历所有层级来设置getter和setter，这不仅增加了初始化的开销，也增加了内存的占用。

### 2.3.3 Proxy的引入与核心优势

ES6引入的Proxy对象提供了一个强大的元编程能力，可以创建一个对象的代理，从而拦截并自定义对该对象的各种操作。与`Object.defineProperty`相比，Proxy以整个对象为单位进行代理，而不是逐个属性进行处理，这带来了根本性的优势。

```javascript
// Proxy实现数据劫持的基本模式
function reactive(target) {
  return new Proxy(target, {
    get(obj, key, receiver) {
      console.log(`读取属性 ${String(key)}`);
      track(obj, key); // 依赖收集
      return Reflect.get(obj, key, receiver);
    },
    set(obj, key, value, receiver) {
      console.log(`设置属性 ${String(key)}: ${value}`);
      const result = Reflect.set(obj, key, value, receiver);
      trigger(obj, key); // 触发更新
      return result;
    },
    deleteProperty(obj, key) {
      console.log(`删除属性 ${String(key)}`);
      const result = Reflect.deleteProperty(obj, key);
      trigger(obj, key);
      return result;
    },
  });
}

// 使用示例
const state = reactive({ count: 0, name: "Vue" });
state.count; // 触发get，收集依赖
state.count = 1; // 触发set，触发更新
delete state.name; // 触发deleteProperty，触发更新
```

Proxy的核心优势体现在多个方面。首先，Proxy可以监听对象的任意操作，包括get、set、deleteProperty、has、ownKeys等13种拦截操作，而`Object.defineProperty`只能监听单个属性的读写。其次，Proxy可以直接监听数组的变化，包括通过索引赋值和修改length的操作。第三，Proxy可以监听属性的新增和删除，不需要像Vue 2那样依赖`Vue.set`方法。第四，Proxy不需要递归遍历对象的嵌套属性，只有当嵌套对象被访问时才会创建其代理，这被称为"懒代理"或"惰性响应"。

```javascript
// Proxy的优势示例
const state = reactive({
  items: [1, 2, 3],
  nested: { value: "hello" },
});

// 数组变化可以被正确监听
state.items[0] = 99; // ✅ 触发更新
state.items.push(4); // ✅ 触发更新

// 新增属性自动响应
state.newProp = "world"; // ✅ 触发更新

// 删除属性自动响应
delete state.nested; // ✅ 触发更新
```

### 2.3.4 两种方案的性能对比与选型建议

根据Vue社区的基准测试数据，Vue 2和Vue 3的响应式系统在性能表现上存在显著差异。在直接JavaScript操作场景下，Vue 3的响应式系统反而比Vue 2慢2-5倍，这主要是因为Proxy的通用性带来了一定的开销。然而，在NextTick异步操作和组件渲染场景下，Vue 3凭借更高效的批量更新机制和更低的内存占用，表现出更好的整体性能。

| 操作类型           | Vue 2 (ms) | Vue 3 (ms) | 性能比  |
| ------------------ | ---------- | ---------- | ------- |
| Init Data          | 166        | 0.1        | 0.0006x |
| Selected(JS)       | 29         | 137        | 4.72x   |
| ChangeData(JS)     | 65         | 222        | 3.42x   |
| Selected(NextTick) | 1569       | 1020       | 0.65x   |

从数据中可以看出，Vue 3在响应式对象创建方面的性能提升了约1600倍，这是因为Proxy只需要创建一个代理对象，而`Object.defineProperty`需要递归遍历所有属性。在直接修改数据的场景下，Vue 3的性能略低于Vue 2，这是因为Proxy的通用拦截机制比专用的getter/setter开销更大。但在经过NextTick调度后的更新操作中，Vue 3凭借更高效的批量更新机制反而表现更好。

综合来看，Vue 3选择Proxy作为响应式系统的实现方案是一个明智的决定。虽然在某些极端场景下Proxy的性能不如优化的`Object.defineProperty`，但Proxy带来的功能增强（更好的数组支持、自动响应新属性、更好的TypeScript支持）以及在真实应用场景下的整体性能优势，使其成为更优的选择。

---

## 2.4 Watcher与Dep的双向引用机制

### 2.4.1 双向引用的设计动机

在Vue的响应式系统中，Watcher与Dep之间的双向引用机制是一个精妙的设计。这一机制的核心目标是实现高效的双向绑定：当数据变化时，Dep能够通知所有相关的Watcher进行更新；当Watcher重新执行时，它能够准确建立新的依赖关系而不产生残留。

双向引用的设计动机源于响应式系统的两个核心需求。第一是"正向追踪"：当数据被读取时，系统需要知道"有哪些Watcher依赖于这个数据"，以便在数据变化时能够通知它们。第二是"反向清理"：当Watcher重新执行时，它需要"清理之前建立的依赖关系"并"建立新的依赖关系"，以确保依赖关系的准确性。

如果没有双向引用机制，系统将面临两个严重的问题。首先是内存泄漏：由于Watcher持有对Dep的引用，如果缺乏清理机制，不再使用的依赖关系将永远无法被垃圾回收。其次是依赖漂移：同一个Watcher可能依赖于多个属性，如果它只收集新依赖而不清理旧依赖，当某些属性不再被使用时，Dep仍然会保留对该Watcher的引用，导致更新时执行不必要的函数。

### 2.4.2 Dep到Watcher的引用（订阅机制）

Dep到Watcher的引用体现了"订阅-发布"模式的核心思想。当一个响应式属性被读取时，当前的Watcher会通过`depend`方法将自己添加到该属性对应的Dep实例中。这样，当属性未来发生变化时，Dep能够遍历其订阅者列表并通知所有Watcher更新。

```javascript
// Dep的订阅机制实现
class Dep {
  constructor() {
    this.subscribers = new Set(); // 存储所有订阅的Watcher
  }

  depend() {
    // 将当前活跃的Watcher添加到订阅列表
    if (activeEffect) {
      this.subscribers.add(activeEffect);
    }
  }

  notify() {
    // 通知所有订阅的Watcher
    this.subscribers.forEach((watcher) => {
      watcher.update();
    });
  }
}

// 使用示例：创建响应式对象并建立依赖
const state = reactive({ count: 0, double: 0 });

effect(() => {
  console.log(`Count: ${state.count}, Double: ${state.double}`);
});
// 此时，state.count 和 state.double 的Dep中都订阅了这个effect

state.count = 1; // 触发通知，effect重新执行
```

Dep的订阅机制使用了Set数据结构而非数组，这有几个重要的考量。首先，Set自动去重，同一个Watcher对同一属性的多次依赖只会保留一个引用，避免了重复通知的问题。其次，Set的添加和删除操作都是O(1)时间复杂度，对于频繁的依赖收集和清理非常高效。第三，Set提供了更好的语义，表示"一个Watcher对某属性的一次订阅"。

在Vue 3的实现中，Dep的订阅机制还支持更细粒度的控制。例如，可以通过`stop`方法停止对某个Dep的订阅，通过`track`函数的参数控制是否收集依赖，以及通过调试钩子（如`onTrack`和`onTrigger`）来监控依赖的建立和触发过程。

### 2.4.3 Watcher到Dep的反向引用（清理机制）

Watcher到Dep的反向引用主要用于依赖关系的清理。当Watcher重新执行时，它需要首先清除之前建立的所有依赖关系，然后重新收集当前执行上下文中的依赖。这种"先清理、后收集"的策略确保了依赖关系的精确性。

```javascript
// Watcher的反向引用与清理机制
class Watcher {
  constructor(fn) {
    this.fn = fn;
    this.deps = []; // 反向引用：此Watcher依赖的所有Dep
  }

  update() {
    // 1. 清理旧的依赖关系
    this.cleanup();

    // 2. 重新执行函数并收集新依赖
    this.run();
  }

  cleanup() {
    // 遍历所有关联的Dep，移除对此Watcher的引用
    this.deps.forEach((dep) => {
      dep.subscribers.delete(this);
    });
    // 清空引用列表
    this.deps = [];
  }

  run() {
    // 设置当前活跃的Watcher
    const prevActiveEffect = activeEffect;
    activeEffect = this;

    try {
      this.fn(); // 执行用户函数，此时会建立新的依赖关系
    } finally {
      activeEffect = prevActiveEffect;
    }
  }
}
```

反向引用机制的设计有几个精妙之处。首先，`deps`数组记录了Watcher依赖的所有Dep实例，这样在清理时可以直接遍历这个数组，而不需要遍历所有的Dep。其次，清理操作是"软删除"，即从Dep的订阅者集合中移除Watcher，但不会删除Dep本身，这保证了其他Watcher对同一Dep的引用不会受到影响。第三，清理操作在Watcher重新执行之前进行，这确保了新的依赖关系能够正确建立。

### 2.4.4 完整双向引用流程解析

Watcher与Dep的双向引用机制在Vue 3的响应式系统中形成了一个完整的闭环。下面通过一个具体的例子来解析整个流程：

```javascript
// 完整示例：双向引用机制的工作流程
const { reactive, effect } = Vue;

// 1. 创建响应式对象
const state = reactive({
  firstName: "John",
  lastName: "Doe",
});

// 2. 创建副作用函数
const computedName = effect(() => {
  return `${state.firstName} ${state.lastName}`;
});

// 此时发生了以下过程：
// - 访问 state.firstName → get拦截器 → track('firstName') →
//   Dep.firstName.subscribers.add(computedName) → computedName.deps.push(Dep.firstName)
// - 访问 state.lastName → get拦截器 → track('lastName') →
//   Dep.lastName.subscribers.add(computedName) → computedName.deps.push(Dep.lastName)

// 3. 数据变化触发更新
state.firstName = "Jane";

// 此时发生了以下过程：
// - 触发 set拦截器 → trigger('firstName') →
//   Dep.firstName.subscribers 中的所有 effect 执行
//   → computedName.update() 被调用

// 4. Watcher重新执行，清理旧依赖并建立新依赖
// computedName.update() → computedName.cleanup() →
//   Dep.firstName.subscribers.delete(computedName)
//   Dep.lastName.subscribers.delete(computedName)
//   computedName.deps = []
// → computedName.run() → 重新执行fn() → 重新收集依赖
```

这个双向引用机制确保了Vue响应式系统的精确性和效率。精确性体现在：只有真正被Watcher访问的属性才会被追踪，当Watcher不再访问某个属性时，该属性对应的Dep会及时清理对Watcher的引用。效率体现在：更新时只需要遍历相关属性的订阅者列表，而不是遍历所有Watcher；依赖清理时只需要遍历Watcher的deps数组，而不是遍历所有Dep。

---

## 2.5 数组响应式系统的特殊处理方案

### 2.5.1 数组响应式的挑战与Vue的应对策略

数组是JavaScript中最常用的数据结构之一，但也是响应式系统中处理起来最具挑战性的数据类型。与普通对象不同，数组有以下特殊性质：第一，数组通常包含大量元素，如果为每个元素都创建getter和setter会造成巨大的性能开销；第二，数组的主要操作是通过方法（push、pop、splice等）进行的，而不是直接通过索引赋值；第三，数组的长度是可变的，这增加了监听难度。

Vue 2对数组响应式的处理采用了"方法拦截"策略：重写数组的七个变异方法（push、pop、shift、unshift、splice、sort、reverse），在这些方法执行前后插入依赖收集和更新触发的逻辑。这种方法虽然有效，但也存在一些局限：无法监听通过索引直接赋值（arr[0] = x）以及无法监听数组长度的变化。

Vue 3基于Proxy的响应式系统从根本上解决了这些问题。Proxy能够拦截数组的所有操作，包括索引访问、索引赋值、length修改以及各种数组方法。这意味着Vue 3可以天然地支持数组的响应式，而不需要像Vue 2那样通过重写方法来"打补丁"。

### 2.5.2 Proxy对数组操作的拦截

在Vue 3中，数组和普通对象使用相同的Proxy处理机制，但get和set拦截器需要针对数组的特性进行特殊处理。当访问数组元素时，会触发get拦截器；当修改数组元素或长度时，会触发set拦截器；当调用数组方法时，方法内部的属性访问也会触发依赖收集。

```javascript
// Proxy对数组操作的拦截示例
function reactive(target) {
  if (!Array.isArray(target)) return target;

  return new Proxy(target, {
    get(obj, key, receiver) {
      track(obj, key);

      // 处理数组的特殊属性
      if (key === "length") {
        return obj.length;
      }

      const result = Reflect.get(obj, key, receiver);

      // 对访问的方法进行包装，添加响应式处理
      if (typeof result === "function" && arrayMethods.includes(key)) {
        return function (...args) {
          // 1. 记录操作前的长度
          const prevLength = obj.length;

          // 2. 执行原方法
          const result = result.apply(this, args);

          // 3. 触发更新
          trigger(obj, "length"); // 长度变化

          // 4. 处理新增元素的响应式转换
          if (obj.length > prevLength) {
            for (let i = prevLength; i < obj.length; i++) {
              reactive(obj[i]); // 确保新元素也是响应式的
            }
          }

          return result;
        };
      }

      // 递归处理嵌套数组元素
      if (Array.isArray(result)) {
        return reactive(result);
      }

      return result;
    },

    set(obj, key, value, receiver) {
      const oldValue = obj[key];
      const result = Reflect.set(obj, key, value, receiver);

      // 触发更新
      trigger(obj, key);

      // 特殊处理length属性的变化
      if (key === "length" && oldValue !== value) {
        trigger(obj, "length");
      }

      return result;
    },
  });
}

// 使用示例
const list = reactive([1, 2, 3]);
list[0] = 100; // ✅ 触发更新（Vue 3新增支持）
list.push(4); // ✅ 触发更新
list.length = 1; // ✅ 触发更新
```

Vue 3的数组响应式处理相比Vue 2有以下几个显著的改进。首先，通过索引赋值可以直接触发更新：`arr[0] = x`在Vue 3中是响应式的，而在Vue 2中需要使用`splice`方法或`Vue.set`。其次，数组长度的变化会被正确监听，修改`arr.length`会触发相关的更新。第三，新添加的元素会自动转换为响应式，不需要额外的处理。

### 2.5.3 数组方法的拦截与包装

尽管Proxy能够拦截大部分数组操作，Vue 3仍然对数组的变异方法进行了一些特殊处理，以确保更好的响应式行为。这些处理主要包括：在方法执行前后进行依赖收集和触发更新，对新添加的元素进行响应式转换，以及处理一些边界情况。

```javascript
// Vue 3数组方法的特殊处理
const arrayMethods = [
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
];

// 创建修改后的数组原型
const arrayPrototype = Object.create(Array.prototype);
arrayMethods.forEach((method) => {
  const originalMethod = Array.prototype[method];

  arrayPrototype[method] = function (...args) {
    // 1. 记录原始返回值
    const result = originalMethod.apply(this, args);

    // 2. 触发更新
    trigger(this, "length");

    // 3. 处理新增元素的响应式转换
    if (method === "push" || method === "unshift" || method === "splice") {
      for (let i = 0; i < args.length; i++) {
        if (Array.isArray(args[i])) {
          // 数组元素也需要递归响应式处理
          args[i] = reactive(args[i]);
        }
      }
    }

    return result;
  };
});
```

在Vue 3的实际实现中，数组方法的拦截更加复杂和精细。Vue 3区分了"拦截器"和"方法"：拦截器是在Proxy的get处理器中返回的包装函数，而方法则是实际执行操作的函数。这种设计允许Vue 3在保持响应式能力的同时，尽可能地复用原生Array的方法实现，以获得最佳的性能。

### 2.5.4 数组响应式的边界情况处理

数组响应式系统中存在一些边界情况需要特别处理，包括稀疏数组、包含NaN的数组、以及数组与其他数据结构（如Set、Map）的组合使用。Vue 3对这些边界情况都做了相应的处理。

```javascript
// 数组响应式的边界情况处理
const state = reactive({
  list: [1, 2, 3],
  sparse: [1, , 3], // 稀疏数组
  withNaN: [NaN, NaN], // 包含NaN的数组
});

// 稀疏数组的处理
state.sparse[1] = 2; // ✅ 正确触发更新
console.log(state.sparse[1]); // ✅ 正确返回2（而非undefined）

// NaN的比较处理
state.withNaN[0] = state.withNaN[1]; // ✅ 即使值相同也触发更新
// 因为Vue 3使用的是Object.is比较，可以正确处理NaN

// 数组元素为对象时的处理
const listWithObjects = reactive([{ name: "Vue" }]);
listWithObjects[0].name = "Vue3"; // ✅ 嵌套对象的属性变化也响应式
listWithObjects[0] = { name: "React" }; // ✅ 替换整个元素也响应式
```

Vue 3对数组响应式的完整支持大大简化了开发者的编码工作。在Vue 2时代，开发者需要记住哪些数组操作是响应式的、哪些不是；而在Vue 3中，几乎所有的数组操作都是响应式的，这使得代码更加直观和可靠。

---

## 2.6 响应式系统的性能优化与缓存策略

### 2.6.1 性能优化的必要性与目标

随着Vue应用规模的增长，响应式系统的性能开销可能成为应用的瓶颈。一个典型的场景是大型数据列表的渲染：当列表包含数千甚至数万个元素时，响应式系统的依赖收集和更新触发可能占用大量的CPU时间。因此，对响应式系统进行性能优化是保证应用流畅运行的关键。

Vue 3响应式系统的性能优化主要围绕以下几个目标展开：第一，减少不必要的依赖收集，避免追踪那些不会被使用的响应式数据；第二，优化更新触发的效率，确保只有真正需要更新的视图才会被重新渲染；第三，降低响应式系统的内存占用，特别是在处理大型数据集合时；第四，提供灵活的API，让开发者能够根据具体场景选择最合适的响应式策略。

### 2.6.2 惰性响应式与shallowRef/shallowReactive

Vue 3提供了`shallowRef`和`shallowReactive`两个API，用于创建浅层响应式数据。这些API只追踪顶层属性的变化，而不会对嵌套对象进行递归响应式转换。这种设计在处理大型数据集时特别有用，可以显著减少响应式系统的开销。

```javascript
// shallowRef vs ref 的对比
import { ref, shallowRef, reactive, shallowReactive } from "vue";

// ref：对基本类型和对象都进行深度响应式转换
const deepState = ref({
  user: { name: "Vue", profile: { age: 3 } },
  items: [{ id: 1 }, { id: 2 }],
});

// shallowRef：只追踪.value本身的赋值，不追踪嵌套对象的变化
const shallowState = shallowRef({
  user: { name: "Vue", profile: { age: 3 } },
  items: [{ id: 1 }, { id: 2 }],
});

// 使用对比
deepState.value.user.name = "Vue3"; // ✅ 触发更新
shallowState.value.user.name = "Vue3"; // ❌ 不触发更新
shallowState.value = { user: { name: "Vue3" } }; // ✅ 触发更新

// shallowReactive：只追踪顶层属性的响应式
const state = shallowReactive({
  user: { name: "Vue", profile: { age: 3 } }, // 嵌套对象不是响应式的
  items: [{ id: 1 }, { id: 2 }], // 数组元素不是响应式的
});

state.user.name = "Vue3"; // ❌ 不触发更新
state.user = { name: "Vue3" }; // ✅ 触发更新
```

根据性能测试数据，使用`shallowReactive`处理大型数据集可以将响应式转换的开销降低约60%。这对于处理后端返回的大型数据结构（如表格数据、API响应等）特别有效。开发者只需要在需要响应式的顶层使用`shallowReactive`，在需要深层响应式的特定路径上使用`reactive`进行局部转换。

### 2.6.3 markRaw与toRaw的精确控制

Vue 3提供了`markRaw`和`toRaw`两个API，用于对响应式系统进行更精细的控制。`markRaw`可以将一个对象标记为"永远不需要响应式转换"，而`toRaw`则可以获取响应式对象的原始版本。

```javascript
// markRaw 和 toRaw 的使用
import { reactive, markRaw, toRaw, shallowRef } from "vue";

// 使用markRaw避免大型对象的不必要响应式转换
const bigData = {
  /* 包含数千个属性 */
};
// 如果这个对象不需要响应式，可以标记它
const state = reactive({
  meta: { name: "config" },
  data: markRaw(bigData), // bigData 将不会是响应式的
});

state.data === bigData; // ✅ true，指向同一个对象
state.data.property = "value"; // ❌ 不会触发更新

// 使用toRaw获取响应式对象的原始版本
const state = reactive({ count: 0 });
const rawState = toRaw(state);

console.log(state === rawState); // ✅ false
console.log(state === reactive(rawState)); // ✅ true

// toRaw的典型应用场景：在发送API请求时传递原始数据
function saveData(data) {
  const rawData = toRaw(data); // 获取原始数据，避免Proxy带来的额外开销
  return fetch("/api/save", { method: "POST", body: JSON.stringify(rawData) });
}
```

`markRaw`的应用场景包括：第三方库的实例、只需要展示而不需要响应的大数据对象、以及某些不需要响应式的配置对象。通过合理使用`markRaw`，开发者可以显著减少响应式系统的内存占用和运行开销。

### 2.6.4 批量更新与调度策略

Vue 3的响应式系统实现了高效的批量更新机制，避免了在连续多次数据修改时产生多余的更新操作。这一机制的核心是使用Promise微任务来延迟执行实际的更新操作，从而将同一事件循环中的多次修改合并为一次更新。

```javascript
// 批量更新机制示例
import { nextTick, reactive } from "vue";

const state = reactive({ count: 0, name: "" });

function batchUpdate() {
  state.count = 1; // 不会立即触发更新
  state.name = "Vue"; // 不会立即触发更新
  state.items = [1, 2, 3]; // 不会立即触发更新

  // 使用nextTick等待批量更新完成
  nextTick(() => {
    console.log("DOM已更新:", state.count, state.name);
  });
}

// 执行上述函数后，只会触发一次组件重新渲染
// 而不是三次独立的渲染
```

Vue 3的调度器还支持对更新进行排序和去重。组件的更新按照层级顺序进行（父组件先于子组件），这确保了DOM结构的一致性。同时，调度器会去除重复的更新任务，避免同一组件在同一个更新周期中被多次更新。

### 2.6.5 computed的缓存机制

计算属性（computed）是Vue响应式系统中性能优化的典范。计算属性具有"惰性求值"和"结果缓存"两个特性：只有当依赖的数据发生变化时，计算属性才会重新求值；如果依赖没有变化，计算属性会直接返回缓存的结果，而不会执行额外的计算。

```javascript
// computed的缓存机制示例
import { reactive, computed } from "vue";

const state = reactive({
  price: 100,
  quantity: 5,
});

// 计算属性：只会在依赖变化时重新计算
const total = computed(() => {
  console.log("计算 total...");
  return state.price * state.quantity;
});

console.log(total.value); // 输出：计算 total... 500
console.log(total.value); // 输出：500（使用缓存，不重复计算）

state.quantity = 10; // 触发更新
console.log(total.value); // 输出：计算 total... 1000

state.price = 200; // 再次触发更新
console.log(total.value); // 输出：计算 total... 2000
```

计算属性的缓存机制在处理复杂计算时特别有价值。例如，一个基于大型数组计算的汇总值，如果数组没有变化，就不需要每次访问时都重新计算。Vue 3的计算属性实现还支持getter和setter，允许在设置计算属性时触发反向的逻辑。

### 2.6.6 性能优化的最佳实践总结

综合以上分析，Vue 3响应式系统的性能优化可以总结为以下最佳实践：

第一，合理选择响应式深度。对于大型数据结构，优先使用`shallowReactive`和`shallowRef`，只在真正需要深层响应的路径上使用`reactive`或`ref`。这可以显著减少初始化的开销和内存占用。

第二，标记不需要响应式的数据。使用`markRaw`标记第三方库实例、大型静态数据等不需要响应式处理的对象，避免不必要的Proxy包装和依赖追踪。

第三，利用计算属性的缓存。将复杂的计算逻辑封装为计算属性，利用其缓存机制避免重复计算。同时，合理设置计算属性的依赖，确保只有真正相关的变化才会触发重新计算。

第四，使用虚拟滚动处理大型列表。当列表包含数千个元素时，使用虚拟滚动技术只渲染可视区域内的元素，避免一次性渲染大量DOM节点。

第五，合理使用批量更新。利用Vue的响应式更新机制，将连续的数据修改批量处理。使用`nextTick`等待更新完成后再进行依赖于新DOM的操作。

---

## 参考资料

[1] [Vue.js 官方文档 - 响应式基础](https://vuejs.org/guide/essentials/reactivity-fundamentals) - 高可靠性 - Vue官方提供的响应式系统基础概念文档

[2] [Vue.js 官方文档 - 响应式深度解析](https://vuejs.org/guide/extras/reactivity-in-depth) - 高可靠性 - Vue官方提供的响应式系统深度技术文档

[3] [Vue 3 响应式系统源码实现（GitHub）](https://github.com/vuejs/core/tree/main/packages/reactivity) - 高可靠性 - Vue 3 核心响应式模块源码

[4] [Vue 2 vs Vue 3 响应式系统性能基准测试](https://github.com/yArna/Vue2-vs-Vue3) - 中高可靠性 - 社区提供的Vue 2和Vue 3响应式性能对比测试

[5] [Vue 3 响应式系统完整执行流程分析](https://mianshi.idocdown.com/en/app/articles/blogs/detail/1223) - 中可靠性 - Vue 3响应式系统源码级别执行流程详解

[6] [Vue.js响应式系统观察者模式实现分析](https://deepsource.com/blog/reactivity-in-vue) - 中可靠性 - Vue响应式系统中观察者模式的具体应用解析

[7] [手摸手实现Vue3 Reactivity](https://zhuanlan.zhihu.com/p/365023012) - 中可靠性 - Vue 3响应式系统手把手实现教程

[8] [Vue 3 Proxy vs Object.defineProperty 技术对比](https://segmentfault.com/a/1190000040731258) - 中可靠性 - Proxy与Object.defineProperty的技术对比分析

[9] [Vue 3 数组响应式系统特殊处理方案](https://www.jb51.net/article/273147.htm) - 中可靠性 - Vue 3数组响应式系统实现详解

[10] [Vue 3 响应式系统性能优化指南](https://www.jianshu.com/p/8a8214a599c4) - 中可靠性 - Vue 3响应式系统大规模数据处理优化指南
