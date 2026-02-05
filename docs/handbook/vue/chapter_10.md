# 第10章 Vue 3组合式API的设计革新

> 本章导读：Vue 3的组合式API（Composition API）代表了Vue框架在组件设计范式上的重大转变。从Vue 2的选项式API（Options API）到Vue 3的组合式API，这一演进不仅仅是语法层面的变化，更是对现代前端开发需求的深刻回应。本章将从设计理念、核心实现原理、性能优化等多个维度，深入剖析Vue 3组合式API的设计革新，帮助读者真正理解这一变革背后的技术逻辑与实践价值。通过阅读本章，你将能够掌握组合式API的核心概念，理解其相对于传统选项式API的优势，并能够在实际项目中灵活运用这些新特性来构建高质量的Vue应用。

## 10.1 Composition API与Options API的设计对比

### 10.1.1 选项式API的设计局限

在深入探讨Vue 3组合式API之前，我们首先需要理解它的前任——选项式API（Options API）的设计理念及其在现代前端开发中暴露出的局限性。Vue 2自发布以来，选项式API一直是Vue组件开发的主流方式，它通过将组件的逻辑按照不同的选项进行分类组织，如`data`、`methods`、`computed`、`watch`等，这种方式在小型项目中表现出色，代码结构清晰、易于理解和维护。然而，随着前端应用规模的不断扩大和业务逻辑的日益复杂，选项式API的一些固有缺陷逐渐显现出来。

选项式API最显著的问题在于**逻辑关注点分散**。当我们开发一个功能丰富的复杂组件时，相关联的逻辑代码往往会散布在不同的选项中。以一个用户资料编辑组件为例，与用户信息相关的代码可能分布在`data`（用户数据定义）、`methods`（保存方法）、`computed`（格式化显示）、`watch`（数据验证）等多个位置。这种分散的组织方式使得开发者在修改某个功能时，需要在文件中来回跳转，大大降低了代码的可维护性和可读性。在团队协作开发中，这种情况尤为突出，新成员很难快速理解某个功能的完整实现逻辑。

```javascript
// Vue 2 选项式API示例 - 逻辑分散问题
export default {
  // 用户基本信息
  data() {
    return {
      user: { name: "", email: "", age: 0 },
      formValid: false,
      isSubmitting: false,
    };
  },

  // 用户名验证逻辑
  computed: {
    nameError() {
      if (!this.user.name) return "用户名不能为空";
      if (this.user.name.length < 2) return "用户名至少2个字符";
      return "";
    },
    emailError() {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!this.user.email) return "邮箱不能为空";
      if (!emailRegex.test(this.user.email)) return "邮箱格式不正确";
      return "";
    },
    isFormValid() {
      return !this.nameError && !this.emailError;
    },
  },

  // 用户操作方法
  methods: {
    async submitForm() {
      if (!this.isFormValid) return;
      this.isSubmitting = true;
      try {
        await this.$api.updateUser(this.user);
        this.$message.success("保存成功");
      } catch (error) {
        this.$message.error("保存失败");
      } finally {
        this.isSubmitting = false;
      }
    },
    resetForm() {
      this.user = { name: "", email: "", age: 0 };
    },
  },

  // 数据监听
  watch: {
    "user.name": {
      handler() {
        this.validateForm();
      },
      deep: true,
    },
  },

  mounted() {
    this.loadUserData();
  },
};
```

另一个严重的问题是**逻辑复用困难**。在Vue 2中，我们通常使用Mixin（混入）来实现跨组件的逻辑复用。然而，Mixin存在诸多问题：首先，多个Mixin之间可能发生命名冲突，当两个Mixin定义了同名的数据属性或方法时，后者会覆盖前者；其次，Mixin中的数据来源不清晰，组件无法知道某个属性到底来自哪个Mixin，这给调试和代码审查带来了困难；此外，Mixin与组件之间的通信机制不完善，无法传递参数来定制Mixin的行为。

```javascript
// Vue 2 Mixin示例 - 逻辑复用的问题
const userMixin = {
  data() {
    return {
      user: null,
      isLoading: false,
    };
  },
  methods: {
    async loadUserData() {
      this.isLoading = true;
      this.user = await this.$api.getUser();
      this.isLoading = false;
    },
  },
};

const authMixin = {
  data() {
    return {
      isAuthenticated: false,
      currentUser: null,
    };
  },
  methods: {
    checkAuth() {
      this.isAuthenticated = !!localStorage.getItem("token");
    },
  },
};

// 组件中使用多个Mixin
export default {
  mixins: [userMixin, authMixin],
  // 问题：两个Mixin可能有同名属性，无法区分来源
  // 问题：组件无法向Mixin传递参数
  // 问题：调试时很难追溯数据的来源
};
```

选项式API还面临着**类型推断不完善**的挑战。虽然Vue 2对TypeScript提供了一定程度的支持，但由于其设计依赖于`this`上下文来访问组件状态和方法，TypeScript的编译器无法准确推断出`this`的完整类型结构。这意味着开发者在使用TypeScript编写Vue组件时，往往无法获得准确的代码补全和类型检查，削弱了TypeScript本应带来的开发体验提升。

### 10.1.2 组合式API的设计理念

面对选项式API的这些局限性，Vue 3引入了组合式API（Composition API），这是一种全新的组件编写范式，它将组件的逻辑按照功能相关性进行组织，而不是按照选项类型进行分类。组合式API的核心思想是：**让相关的代码更紧密地组织在一起，使功能的定义更加聚合和内聚**。这种设计理念借鉴了React Hooks的函数式编程思想，但又保持了Vue特有的响应式系统优势。

组合式API的入口是`setup`函数。在Vue 3中，`setup`函数是组件初始化阶段最先执行的函数，它接收两个参数：`props`（组件接收的属性）和`context`（包含`attrs`、`slots`、`emit`等上下文信息）。`setup`函数的返回值将直接暴露给模板使用，可以是数据、方法或生命周期钩子等。与选项式API中`this`指向组件实例不同，`setup`函数中的`this`是`undefined`，所有的响应式数据都需要通过Vue提供的API显式创建。

```javascript
// Vue 3 组合式API示例 - 逻辑聚合
import { ref, computed, onMounted } from "vue";

export default {
  setup(props, { emit }) {
    // 响应式状态定义
    const user = ref({ name: "", email: "", age: 0 });
    const isSubmitting = ref(false);

    // 计算属性 - 用户名验证
    const nameError = computed(() => {
      if (!user.value.name) return "用户名不能为空";
      if (user.value.name.length < 2) return "用户名至少2个字符";
      return "";
    });

    // 计算属性 - 邮箱验证
    const emailError = computed(() => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!user.value.email) return "邮箱不能为空";
      if (!emailRegex.test(user.value.email)) return "邮箱格式不正确";
      return "";
    });

    // 计算属性 - 表单验证结果
    const isFormValid = computed(() => {
      return !nameError.value && !emailError.value;
    });

    // 方法定义
    async function submitForm() {
      if (!isFormValid.value) return;
      isSubmitting.value = true;
      try {
        await props.api.updateUser(user.value);
        emit("success");
      } catch (error) {
        emit("error", error);
      } finally {
        isSubmitting.value = false;
      }
    }

    function resetForm() {
      user.value = { name: "", email: "", age: 0 };
    }

    // 生命周期钩子
    onMounted(async () => {
      const data = await props.api.getUser();
      if (data) user.value = data;
    });

    // 暴露给模板
    return {
      user,
      isSubmitting,
      nameError,
      emailError,
      isFormValid,
      submitForm,
      resetForm,
    };
  },
};
```

通过对比两种API风格，我们可以清晰地看到组合式API的优势所在。首先，所有与用户表单相关的逻辑——状态定义、验证规则、提交方法——都集中在`setup`函数内部，开发者可以在一个屏幕范围内查看完整的功能实现。其次，逻辑复用变得简单而清晰：通过将可复用的逻辑抽取为独立的函数（通常称为"组合式函数"或"自定义Hook"），可以在不同组件间共享这些逻辑，且数据来源清晰可见。

### 10.1.3 组合式API的核心优势

组合式API相对于选项式API的优势可以从多个维度进行分析。**在逻辑组织方面**，组合式API允许开发者按照功能模块来组织代码，每个功能的所有相关逻辑（状态、计算属性、方法、生命周期等）都集中在一起。这种"高内聚"的代码组织方式使得代码更易于理解和维护。当需要修改某个功能时，开发者只需关注一个代码块，而不需要在多个选项之间跳转。

**在逻辑复用方面**，组合式API提供了更加优雅和灵活的复用机制。通过将可复用的逻辑封装为自定义Hook函数，可以实现跨组件的逻辑共享。与Mixin相比，自定义Hook具有以下优势：数据来源清晰可见，开发者可以明确知道某个状态来自哪个Hook；支持参数传递，可以根据不同场景定制Hook的行为；支持状态共享，多个组件可以使用同一个Hook实例，也可以各自拥有独立的状态；避免命名冲突，Hook内部的变量和方法对外部不可见，只有显式返回的内容才会暴露出来。

```javascript
// 自定义Hook示例 - 优雅的逻辑复用
// composables/useFormValidation.js
import { ref, computed } from "vue";

export function useFormValidation(rules) {
  const errors = ref({});

  function validateField(fieldName, value) {
    const rule = rules[fieldName];
    if (!rule) return "";

    if (rule.required && !value) {
      return rule.message || `${fieldName}不能为空`;
    }
    if (rule.minLength && value.length < rule.minLength) {
      return rule.message || `${fieldName}至少${rule.minLength}个字符`;
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      return rule.message || `${fieldName}格式不正确`;
    }
    return "";
  }

  function validateForm(formData) {
    const newErrors = {};
    let isValid = true;

    for (const fieldName in rules) {
      const error = validateField(fieldName, formData[fieldName]);
      if (error) {
        newErrors[fieldName] = error;
        isValid = false;
      }
    }

    errors.value = newErrors;
    return isValid;
  }

  function clearErrors() {
    errors.value = {};
  }

  return {
    errors,
    validateForm,
    clearErrors,
  };
}

// 组件中使用自定义Hook
import { useFormValidation } from "@/composables/useFormValidation";

const rules = {
  username: { required: true, minLength: 2 },
  email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
};

const { errors, validateForm, clearErrors } = useFormValidation(rules);
```

**在类型推断方面**，组合式API提供了更好的TypeScript支持。由于组合式API主要使用函数来创建响应式数据和方法，TypeScript可以更准确地推断出这些数据的类型结构。`ref`、`reactive`、`computed`等API都有完整的类型定义，开发者可以获得准确的代码补全和类型检查提示。这对于使用TypeScript开发大型应用的项目来说是一个重要的优势。

**在Tree-shaking支持方面**，组合式API的函数都是独立导出的，这意味着构建工具可以识别哪些功能被实际使用，并只打包这些被使用的代码。这有助于减小最终构建产物的体积，提高应用的加载性能。相比之下，选项式API中的许多选项（如`mounted`/`created`等生命周期钩子）无法被Tree-shaking优化，因为它们都是在组件定义时就被包含进去了。

```javascript
// 组件中使用<script setup>语法糖 - 更简洁的组合式API
<script setup>
import { ref, computed, onMounted } from 'vue'

// 响应式状态
const count = ref(0)
const doubleCount = computed(() => count.value * 2)

// 方法
function increment() {
  count.value++
}

// 生命周期
onMounted(() => {
  console.log('组件已挂载')
})
</script>

<template>
  <div>
    <p>计数: {{ count }}</p>
    <p>双倍: {{ doubleCount }}</p>
    <button @click="increment">增加</button>
  </div>
</template>
```

`<script setup>`语法糖进一步简化了组合式API的使用。使用这种语法时，不需要显式地编写`setup`函数，组件的顶层变量和方法会自动暴露给模板。这不仅减少了模板代码，还提供了更好的运行时性能，因为它减少了包装层的开销。

## 10.2 reactive与ref响应式API的实现原理

### 10.2.1 Vue 2响应式系统的局限性

理解Vue 3中`reactive`和`ref`的实现原理，需要首先回顾Vue 2响应式系统的局限性。Vue 2使用`Object.defineProperty`来实现响应式数据绑定。这种方式通过为对象的每个属性定义`getter`和`setter`来拦截对属性的读取和写入操作，从而实现依赖收集和响应式更新。然而，`Object.defineProperty`存在几个根本性的缺陷。

**第一，`Object.defineProperty`无法监听对象属性的新增和删除**。当我们为一个对象添加新属性时，由于该属性在初始化时没有被defineProperty处理，因此不会触发响应式更新。同样，删除对象属性也不会触发响应式更新。在Vue 2中，为了解决这个问题，Vue提供了`Vue.set`和`Vue.delete`全局方法来添加或删除响应式属性，但这增加了API的复杂性，开发者需要时刻记住使用这些特殊方法。

```javascript
// Vue 2 中对象属性新增的问题
const vm = new Vue({
  data() {
    return {
      user: { name: "John" },
    };
  },
});

// 这种方式添加的属性不是响应式的
vm.user.age = 25;
console.log(vm.user.age); // 25 - 值确实变了，但视图不会更新！

// 必须使用Vue.set
Vue.set(vm.user, "age", 25); // 这样才是响应式的
// 或者
this.$set(this.user, "age", 25);
```

**第二，`Object.defineProperty`无法监听数组的变化**。当我们通过索引直接设置数组元素（如`arr[0] = value`）时，由于索引在初始化时已经被defineProperty处理，理论上应该能触发更新，但Vue 2出于性能考虑选择不处理这种情况。此外，数组的`push`、`pop`、`shift`、`unshift`、`splice`、`sort`、`reverse`等方法虽然能够触发更新，但这并非通过defineProperty实现，而是Vue 2重写了这些数组方法。这意味着某些数组操作（如使用`filter`创建新数组）不会触发响应式更新，需要开发者特别注意。

```javascript
// Vue 2 中数组操作的限制
const vm = new Vue({
  data() {
    return {
      items: ["a", "b", "c"],
    };
  },
});

// 以下操作不会触发响应式更新
vm.items[0] = "x"; // 无效！
vm.items.length = 1; // 无效！

// 以下操作可以触发响应式更新
vm.items.splice(0, 1, "x"); // 有效
vm.items = ["x", "y", "z"]; // 有效（重新赋值）
```

**第三，`Object.defineProperty`只能劫持对象的已有属性**。这意味着对于嵌套层级较深的属性，必须在初始化时进行递归处理，否则深层属性的变化无法被监听。这不仅增加了初始化的性能开销，还可能导致某些深层属性的更新被遗漏。

### 10.2.2 Proxy带来的革命性变化

Vue 3彻底重构了响应式系统，使用ES6的`Proxy`替代了`Object.defineProperty`。`Proxy`是ES6引入的元编程特性，它可以创建一个对象的代理，从而拦截对该对象的各种操作。`Proxy`能够监听对象的任何变化，包括属性的添加、删除、修改，以及数组和Map、Set等数据结构的操作。

```javascript
// Proxy的基本用法
const target = { name: "John", age: 25 };
const proxy = new Proxy(target, {
  get(target, property, receiver) {
    console.log(`获取属性: ${property}`);
    return Reflect.get(target, property, receiver);
  },
  set(target, property, value, receiver) {
    console.log(`设置属性: ${property} = ${value}`);
    return Reflect.set(target, property, value, receiver);
  },
  deleteProperty(target, property) {
    console.log(`删除属性: ${property}`);
    return Reflect.deleteProperty(target, property);
  },
});

// 测试
proxy.name; // 触发getter，输出：获取属性: name
proxy.age = 30; // 触发setter，输出：设置属性: age = 30
delete proxy.age; // 触发deleteProperty，输出：删除属性: age
```

`Proxy`相比`Object.defineProperty`的优势是全方位的。首先，`Proxy`可以监听**整个对象**的变化，而不需要在初始化时遍历对象的每个属性。这不仅简化了实现代码，还提高了初始化的性能。其次，`Proxy`能够监听**所有操作**，包括属性获取、属性设置、属性删除、对象冻结、原型链操作等。第三，`Proxy`对**数组操作天然友好**，不需要像Vue 2那样重写数组方法。

### 10.2.3 reactive函数的核心实现

`reactive`是Vue 3中用于创建响应式对象的核心API。它接受一个普通对象作为参数，返回一个代理对象，该代理对象的所有属性操作都会被Vue的响应式系统拦截和跟踪。

```javascript
// reactive的基本用法
import { reactive, isProxy } from "vue";

const state = reactive({
  count: 0,
  user: {
    name: "John",
    age: 25,
  },
});

console.log(isProxy(state)); // true
console.log(state.count); // 0，触发getter
state.count++; // 触发setter
state.user.age = 30; // 深层属性也是响应式的
```

`reactive`的实现原理可以概括为以下几个关键步骤。**第一步**，创建Proxy代理。`reactive`函数内部使用`new Proxy(target, handler)`来创建代理对象，其中`handler`定义了各种拦截操作。**第二步**，设置响应式处理逻辑。在`handler`的`get`操作中，Vue会进行依赖收集——当某个响应式属性被访问时，当前的计算属性或watcher会被记录下来。在`set`操作中，Vue会触发依赖更新——当响应式属性被修改时，所有依赖该属性的计算属性和watcher都会被重新执行。**第三步**，递归处理嵌套对象。对于嵌套的对象属性，`reactive`会递归地将其转换为响应式，确保整个对象树都是响应式的。

```javascript
// reactive的简化实现原理
function reactive(target) {
  // 创建Proxy代理
  const proxy = new Proxy(target, {
    get(target, key, receiver) {
      const result = Reflect.get(target, key, receiver);

      // 依赖收集
      track(target, key);

      // 递归处理嵌套对象
      if (isObject(result)) {
        return reactive(result);
      }

      return result;
    },
    set(target, key, value, receiver) {
      const result = Reflect.set(target, key, value, receiver);

      // 触发更新
      trigger(target, key, value);

      return result;
    },
    deleteProperty(target, key) {
      const result = Reflect.deleteProperty(target, key);

      // 触发删除更新
      trigger(target, key);

      return result;
    },
  });

  return proxy;
}
```

### 10.2.4 ref函数的实现机制

`ref`是Vue 3中用于创建基础类型响应式数据的API。虽然`reactive`可以创建响应式对象，但它主要用于引用类型。对于基础类型（如字符串、数字、布尔值），`reactive`无法直接处理（虽然可以通过包装成对象来实现，但这不是最佳实践）。`ref`专门用于处理这种情况，它返回一个包含`value`属性的响应式对象。

```javascript
// ref的基本用法
import { ref, isRef, toRef, toRefs } from "vue";

// 创建基础类型的响应式
const count = ref(0);
console.log(count.value); // 0
count.value++;
console.log(count.value); // 1

// 判断是否是ref
console.log(isRef(count)); // true
console.log(isRef(0)); // false

// 将对象的属性转换为ref
const state = { name: "John", age: 25 };
const nameRef = toRef(state, "name");
console.log(nameRef.value); // 'John'
state.name = "Jane";
console.log(nameRef.value); // 'Jane'

// 将响应式对象的所有属性转换为ref
const state2 = reactive({ name: "John", age: 25 });
const stateRefs = toRefs(state2);
// stateRefs.name.value === 'John'
```

`ref`的内部实现非常巧妙。对于基础类型，`ref`创建一个包含`value`属性的对象，并对该对象的`value`属性进行响应式处理。对于引用类型，`ref`内部会调用`reactive`来创建响应式对象。这种设计使得`ref`可以处理任何类型的数据，同时保持与`reactive`一致的行为。

```javascript
// ref的简化实现原理
function ref(value) {
  // 如果已经是ref，直接返回
  if (isRef(value)) {
    return value;
  }

  // 创建ref对象
  const refObject = {
    // 标记为ref
    __v_isRef: true,
    // 实际的value值
    get value() {
      // 依赖收集
      track(refObject, "value");
      return value;
    },
    set value(newValue) {
      // 更新值
      value = newValue;
      // 触发更新
      trigger(refObject, "value", newValue);
    },
  };

  return refObject;
}
```

### 10.2.5 toRef与toRefs的实用技巧

`toRef`和`toRefs`是两个非常实用的工具函数，它们用于在`reactive`对象和`ref`之间进行转换。`toRef`用于将对象的单个属性转换为`ref`，而`toRefs`用于将整个对象的所有属性都转换为`ref`。

`toRef`的主要用途是**保持响应式关联**。当我们从响应式对象中提取某个属性时，如果直接解构，会丢失响应式关联。使用`toRef`可以保持这种关联：修改`ref`会同步更新原始对象的属性，反之亦然。

```javascript
// toRef的使用场景
import { reactive, toRef } from "vue";

const state = reactive({
  name: "John",
  age: 25,
});

// 错误的解构方式（会丢失响应式）
// const { name, age } = state
// name和age变成普通值，不再响应式

// 正确的解构方式
const nameRef = toRef(state, "name");
const ageRef = toRef(state, "age");

// 修改ref会同步更新原始对象
nameRef.value = "Jane";
console.log(state.name); // 'Jane'

// 修改原始对象也会同步更新ref
state.age = 30;
console.log(ageRef.value); // 30
```

`toRefs`通常用于**将响应式对象转换为普通对象，其中每个属性都是ref**。这在组件需要返回多个ref给模板使用时非常有用，可以保持返回对象的结构清晰。

```javascript
// toRefs的使用场景
import { reactive, toRefs } from "vue";

function useUser() {
  const state = reactive({
    name: "John",
    age: 25,
    email: "john@example.com",
  });

  // 使用toRefs保持响应式关联
  return {
    ...toRefs(state),
  };
}

const { name, age, email } = useUser();
// name、age、email都是ref，且与原始state保持响应式关联
```

## 10.3 computed与watchEffect的依赖收集机制

### 10.3.1 Effect系统概述

Vue 3的响应式系统建立在一个名为"Effect"的抽象概念之上。Effect是一个响应式副作用函数，当它所依赖的响应式数据发生变化时，Effect会自动重新执行。`computed`、`watch`、`watchEffect`等高级响应式API都是基于Effect系统构建的。理解Effect的工作原理是深入掌握Vue 3响应式系统的关键。

Effect系统的核心组件包括三个部分：**ReactiveEffect类**（表示一个副作用函数及其依赖关系）、**依赖收集（track）机制**（在访问响应式属性时记录依赖关系）、**触发更新（trigger）机制**（在响应式属性变化时执行所有依赖该属性的Effect）。

```javascript
// Effect系统的简化实现
let activeEffect = null;

// 依赖收集
function track(target, key) {
  if (activeEffect) {
    // 将当前活跃的effect添加到属性的依赖集合中
    const depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()));
    }
    const dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, (dep = new Set()));
    }
    dep.add(activeEffect);
  }
}

// 触发更新
function trigger(target, key, value) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;
  const dep = depsMap.get(key);
  if (dep) {
    // 执行所有依赖该属性的effect
    dep.forEach((effect) => effect());
  }
}

// 创建并执行effect
function effect(fn) {
  const reactiveEffect = new ReactiveEffect(fn);
  activeEffect = reactiveEffect;
  fn(); // 执行fn，收集依赖
  activeEffect = null;
}
```

### 10.3.2 computed的实现原理

`computed`是Vue 3中用于创建计算属性的API。与Vue 2中的计算属性选项类似，Vue 3的`computed`可以基于其他响应式数据创建派生数据，并且具有缓存能力——只有当依赖项发生变化时，计算属性才会重新计算。

```javascript
// computed的基本用法
import { ref, computed } from "vue";

const count = ref(1);
const doubled = computed(() => {
  console.log("计算执行");
  return count.value * 2;
});

console.log(doubled.value); // 2，输出：计算执行
console.log(doubled.value); // 2，无输出（使用缓存）

count.value = 2;
console.log(doubled.value); // 4，输出：计算执行（依赖变化，重新计算）
```

`computed`的内部实现使用了一个特殊的ReactiveEffect，该Effect会追踪其getter函数中访问的所有响应式属性。当依赖项发生变化时，computed的缓存会失效，下次访问时触发重新计算。为了优化性能，computed还支持创建可写的计算属性，这在需要双向绑定的场景中非常有用。

```javascript
// 可写computed的实现
import { ref, computed } from "vue";

const count = ref(1);
const plusOne = computed({
  // getter
  get() {
    return count.value + 1;
  },
  // setter
  set(val) {
    count.value = val - 1;
  },
});

console.log(plusOne.value); // 2

plusOne.value = 10; // 触发setter
console.log(count.value); // 9
```

### 10.3.3 watchEffect的自动依赖收集

`watchEffect`是Vue 3引入的新API，它与传统的`watch`有所不同。`watchEffect`不需要显式指定要监听的数据源，而是会自动收集Effect函数执行过程中访问的所有响应式依赖。当这些依赖发生变化时，Effect会自动重新执行。

```javascript
// watchEffect的基本用法
import { ref, watchEffect } from "vue";

const count = ref(0);

const stop = watchEffect(() => {
  console.log(`当前计数: ${count.value}`);
  // 自动收集对count的依赖
});

count.value++; // 触发Effect，输出：当前计数: 1
count.value++; // 触发Effect，输出：当前计数: 2

// 停止监听
stop();
```

`watchEffect`的工作原理是在Effect函数执行时，将当前活跃的Effect设置为全局的`activeEffect`。当Effect函数内部访问响应式数据时，`track`函数会将这个Effect添加到该数据的依赖集合中。当响应式数据发生变化时，`trigger`函数会触发所有依赖该数据的Effect重新执行。

```javascript
// watchEffect的简化实现
function watchEffect(effect, options = {}) {
  // 创建包含清理逻辑的Effect
  const reactiveEffect = new ReactiveEffect(() => {
    // 执行传入的effect函数
    effect();
  });

  // 立即执行一次，收集依赖
  reactiveEffect.run();

  // 返回停止函数
  return () => {
    reactiveEffect.stop();
  };
}
```

`watchEffect`还支持清理回调功能，这在处理异步操作时非常有用。当Effect即将重新执行时，之前注册的清理回调会被调用，用于清理上一次的副作用（如取消未完成的请求、清除定时器等）。

```javascript
// watchEffect的清理回调
import { watchEffect } from "vue";

watchEffect((onCleanup) => {
  console.log("Effect执行");

  // 模拟异步操作
  const controller = new AbortController();
  onCleanup(() => {
    // 清理回调：在Effect重新执行前调用
    controller.abort();
    console.log("清理完成");
  });

  // 异步操作逻辑
  fetch("/api/data", { signal: controller.signal }).then(/* ... */);
});
```

### 10.3.4 watch与watchEffect的区别

`watch`是传统的监听器API，它与`watchEffect`的主要区别在于：**`watch`需要显式指定监听的数据源，而`watchEffect`会自动收集依赖**；**`watch`默认是惰性的（只在源变化时执行），而`watchEffect`会立即执行一次**。

```javascript
// watch与watchEffect的对比
import { ref, watch, watchEffect } from "vue";

const count = ref(0);

// watch - 显式指定监听源，惰性执行
watch(count, (newValue, oldValue) => {
  console.log(`count变化: ${oldValue} -> ${newValue}`);
});
// 不会立即执行

// watchEffect - 自动收集依赖，立即执行
watchEffect(() => {
  console.log(`watchEffect: ${count.value}`);
});
// 立即执行一次，输出：watchEffect: 0

count.value++; // 两者都会触发
```

`watch`支持更精细的控制，包括监听多个数据源、获取新旧值、设置`immediate`选项等。

```javascript
// watch的高级用法
import { ref, reactive, watch } from "vue";

const count = ref(0);
const state = reactive({ name: "John" });

// 监听单个ref
watch(count, (newVal, oldVal) => {
  console.log(`count: ${oldVal} -> ${newVal}`);
});

// 监听多个数据源
watch([count, () => state.name], ([newCount, newName], [oldCount, oldName]) => {
  console.log(`变化: ${oldCount},${oldName} -> ${newCount},${newName}`);
});

// 监听响应式对象（深度监听）
watch(
  state,
  (newVal, oldVal) => {
    // 注意：对于响应式对象，新值和旧值是同一个对象
    console.log("state变化");
  },
  { deep: true },
);
```

### 10.3.5 依赖收集的性能优化

Vue 3的Effect系统经过精心设计，在性能方面相比Vue 2有了显著提升。首先，Vue 3使用`Proxy`替代了`Object.defineProperty`，避免了在初始化时遍历对象所有属性的开销。其次，Vue 3实现了**按需收集**的策略——只有在Effect执行过程中访问的响应式属性才会被收集为依赖，未访问的属性不会产生依赖关系。第三，Vue 3支持**分支切换优化**——当条件表达式导致某些代码路径不会被执行时，这些路径中访问的属性不会被收集为依赖。

```javascript
// 分支切换优化的示例
import { ref, watchEffect } from "vue";

const ok = ref(true);
const count = ref(0);

watchEffect(() => {
  if (ok.value) {
    // 只有ok为true时才会访问count
    console.log(`count: ${count.value}`);
  }
  // 当ok为false时，count的变化不会触发Effect重新执行
});

ok.value = false; // 不触发Effect
count.value = 100; // 不触发Effect（ok为false）
ok.value = true; // 触发Effect，输出：count: 100
```

## 10.4 生命周期钩子在Composition API中的实现

### 10.4.1 生命周期钩子的对应关系

Vue 3的Composition API提供了一套与选项式API对应的生命周期钩子函数。这些函数需要在`setup`阶段同步调用，它们会将回调函数注册到当前组件实例上。与选项式API不同，组合式API的生命周期钩子都是函数形式的，而不是选项对象。

```javascript
// Vue 3 生命周期钩子对照表
// 选项式API          -> 组合式API
// beforeCreate      -> setup()
// created           -> setup()
// beforeMount       -> onBeforeMount()
// mounted           -> onMounted()
// beforeUpdate      -> onBeforeUpdate()
// updated           -> onUpdated()
// beforeUnmount     -> onBeforeUnmount()
// unmounted         -> onUnmounted()
// errorCaptured     -> onErrorCaptured()
```

每个生命周期钩子都有其特定的用途。`onBeforeMount`在组件挂载到DOM之前调用，此时组件已完成响应式状态设置，但DOM节点尚未创建。`onMounted`在组件挂载完成后调用，此时组件的DOM树已创建并插入父容器，这是进行DOM操作的合适时机。`onBeforeUpdate`在组件因响应式状态变更而即将更新DOM之前调用，可以在这里访问更新前的DOM状态。`onUpdated`在DOM更新完成后调用，需要注意不要在这里直接修改状态，否则可能导致无限更新循环。

```javascript
// 生命周期钩子的基本用法
import {
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onBeforeUnmount,
  onUnmounted,
  ref,
} from "vue";

export default {
  setup() {
    const el = ref(null);
    const count = ref(0);

    onBeforeMount(() => {
      console.log("组件即将挂载");
      // 此时可以访问this，但el.value还是null
    });

    onMounted(() => {
      console.log("组件已挂载");
      // 此时可以安全地操作DOM
      console.log(el.value); // <div>元素
    });

    onBeforeUpdate(() => {
      console.log("组件即将更新");
      // 可以在DOM更新前访问更新前的状态
    });

    onUpdated(() => {
      console.log("组件已更新");
      // DOM已更新，但应避免在这里修改响应式数据
    });

    onBeforeUnmount(() => {
      console.log("组件即将卸载");
      // 组件实例仍然完全可用
    });

    onUnmounted(() => {
      console.log("组件已卸载");
      // 清理工作应该在这里进行
    });

    return { el, count };
  },
};
```

### 10.4.2 生命周期钩子的实现原理

Vue 3组合式API中的生命周期钩子是通过一个内部机制实现的。每个组件实例都维护着一组生命周期回调列表，当调用`onMounted`、`onUnmounted`等函数时，Vue会将回调函数注册到当前组件实例的对应列表中。这些回调函数会在组件生命周期的相应阶段被依次调用。

```javascript
// 生命周期钩子的简化实现原理
const currentInstance = null;

function setCurrentInstance(instance) {
  currentInstance = instance;
}

function onMounted(callback) {
  if (currentInstance) {
    // 将回调注册到当前组件实例
    currentInstance.mountedCallbacks.push(callback);
  } else {
    console.warn("onMounted必须在setup函数中调用");
  }
}

// 在组件挂载阶段执行回调
function mountComponent(instance) {
  // 执行onBeforeMount回调
  callArrayHook(instance, "beforeMountHooks");

  // 渲染组件...

  // 执行mounted回调
  instance.mountedCallbacks.forEach((callback) => callback());
}
```

这种实现方式的一个重要特性是：**生命周期钩子必须在setup阶段同步调用**。这是因为Vue需要知道当前正在初始化的组件实例，以便将回调函数正确注册到该实例上。如果在异步操作（如setTimeout）中调用生命周期钩子，`currentInstance`可能已经改变，导致回调被注册到错误的组件实例上。

```javascript
// 错误的做法 - 异步调用生命周期钩子
import { onMounted } from 'vue'

export default {
  setup() {
    // 错误：异步调用
    setTimeout(() => {
      onMounted(() => {
        console.log('这不会生效')
      })
    }, 100)
  }
}

// 正确的做法 - 同步调用
import { onMounted } from 'vue'

export default {
  setup() {
    // 正确：同步调用
    onMounted(() => {
      console.log('组件已挂载')
    })
  }
}
```

### 10.4.3 清理工作的正确实践

组件卸载时的清理工作是非常重要的，它可以帮助避免内存泄漏和无效操作。常见的需要清理的资源包括：定时器（setInterval/setTimeout）、事件监听器、动画帧请求（requestAnimationFrame）、WebSocket连接、第三方库的实例等。

```javascript
// 清理工作的正确实践
import { onMounted, onUnmounted, ref } from "vue";

export default {
  setup() {
    const timer = ref(null);
    const resizeHandler = () => {
      console.log("窗口大小变化");
    };

    onMounted(() => {
      // 启动定时器
      timer.value = setInterval(() => {
        // 定时任务
      }, 1000);

      // 添加事件监听器
      window.addEventListener("resize", resizeHandler);
    });

    onUnmounted(() => {
      // 清理定时器
      if (timer.value) {
        clearInterval(timer.value);
      }

      // 移除事件监听器
      window.removeEventListener("resize", resizeHandler);
    });

    return {};
  },
};
```

对于异步操作（如网络请求），`watchEffect`和`watch`提供了清理回调机制，可以在Effect重新执行前清理上一次的操作。

```javascript
// 使用清理回调处理异步操作
import { watchEffect, ref } from "vue";

export default {
  setup() {
    const data = ref(null);
    const id = ref(1);

    watchEffect((onCleanup) => {
      console.log(`获取数据: ${id.value}`);

      // 模拟异步请求
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      fetch(`/api/data/${id.value}`)
        .then((response) => response.json())
        .then((result) => {
          if (!cancelled) {
            data.value = result;
          }
        });
    });

    return { data, id };
  },
};
```

### 10.4.4 调试钩子的使用

Vue 3的Composition API提供了两个用于调试的钩子函数：`onRenderTracked`和`onRenderTriggered`。这两个钩子只在开发模式下生效，可以帮助开发者理解组件的响应式依赖是如何被收集和触发的。

```javascript
// 调试钩子的使用
import { onRenderTracked, onRenderTriggered, ref, computed } from "vue";

export default {
  setup() {
    const count = ref(0);
    const doubled = computed(() => count.value * 2);

    // 当响应式依赖被跟踪时调用
    onRenderTracked((event) => {
      console.log("跟踪依赖:", event);
      // event.target - 被访问的目标对象
      // event.type - 操作类型（get/has/iterate）
      // event.key - 被访问的属性
    });

    // 当依赖触发重新渲染时调用
    onRenderTriggered((event) => {
      console.log("触发更新:", event);
      // event.target - 被修改的目标对象
      // event.type - 操作类型（set/add/delete/clear）
      // event.key - 被修改的属性
      // event.newValue - 新值
      // event.oldValue - 旧值
    });

    return { count, doubled };
  },
};
```

这两个调试钩子在排查响应式相关的bug时非常有用。例如，当组件意外地重新渲染时，可以通过`onRenderTriggered`查看是哪个属性的变化触发了更新。

## 10.5 自定义Hooks的设计模式与复用策略

### 10.5.1 自定义Hook的概念

自定义Hook是Vue 3组合式API中最重要的逻辑复用机制。一个自定义Hook本质上是一个导出响应式数据和函数的JavaScript函数，它封装了可复用的逻辑。与Vue 2中的Mixin相比，自定义Hook提供了更清晰的逻辑来源、更灵活的参数传递、更可靠的类型推断，以及更易于理解的代码结构。

```javascript
// 自定义Hook的基本结构
// composables/useCounter.js
import { ref, computed } from "vue";

export function useCounter(initialValue = 0) {
  const count = ref(initialValue);

  const increment = () => count.value++;
  const decrement = () => count.value--;
  const reset = () => (count.value = initialValue);

  const doubled = computed(() => count.value * 2);
  const isPositive = computed(() => count.value > 0);

  return {
    count,
    increment,
    decrement,
    reset,
    doubled,
    isPositive,
  };
}
```

自定义Hook的命名规范是以`use`开头，这借鉴了React Hooks的约定。使用`use`前缀可以让开发者一眼识别出这是一个可复用的组合式函数，同时也方便静态分析和代码提示。

### 10.5.2 典型应用场景

自定义Hook可以应用于各种场景，包括但不限于：**状态管理**（如本地状态、跨组件状态共享）、**数据获取**（如API请求、数据缓存）、**副作用处理**（如定时器、事件监听）、**表单处理**（如表单验证、表单提交）、**设备API**（如窗口大小、在线状态）等。

```javascript
// 场景1：数据获取Hook
// composables/useFetch.js
import { ref } from "vue";

export function useFetch(url) {
  const data = ref(null);
  const error = ref(null);
  const loading = ref(true);

  async function fetchData() {
    loading.value = true;
    error.value = null;

    try {
      const response = await fetch(url);
      data.value = await response.json();
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  // 立即获取一次数据
  fetchData();

  return {
    data,
    error,
    loading,
    refetch: fetchData,
  };
}

// 组件中使用
import { useFetch } from "@/composables/useFetch";

const { data, error, loading, refetch } = useFetch("/api/users");
```

```javascript
// 场景2：窗口大小Hook
// composables/useWindowSize.js
import { ref, onMounted, onUnmounted } from "vue";

export function useWindowSize() {
  const width = ref(window.innerWidth);
  const height = ref(window.innerHeight);

  function handleResize() {
    width.value = window.innerWidth;
    height.value = window.innerHeight;
  }

  onMounted(() => {
    window.addEventListener("resize", handleResize);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", handleResize);
  });

  return { width, height };
}
```

```javascript
// 场景3：表单处理Hook
// composables/useForm.js
import { ref, reactive, computed } from "vue";

export function useForm(initialValues, validationRules) {
  const values = reactive({ ...initialValues });
  const errors = reactive({});
  const touched = reactive({});
  const submitting = ref(false);

  const isValid = computed(() => {
    return Object.keys(errors).length === 0;
  });

  function validateField(fieldName) {
    const value = values[fieldName];
    const rules = validationRules[fieldName];

    if (!rules) return true;

    for (const rule of rules) {
      if (!rule.test(value)) {
        errors[fieldName] = rule.message;
        return false;
      }
    }

    errors[fieldName] = "";
    return true;
  }

  function validateAll() {
    let valid = true;
    for (const fieldName in validationRules) {
      if (!validateField(fieldName)) {
        valid = false;
      }
    }
    return valid;
  }

  function setFieldValue(fieldName, value) {
    values[fieldName] = value;
    if (touched[fieldName]) {
      validateField(fieldName);
    }
  }

  function setFieldTouched(fieldName) {
    touched[fieldName] = true;
    validateField(fieldName);
  }

  function reset() {
    Object.assign(values, initialValues);
    Object.keys(errors).forEach((key) => (errors[key] = ""));
    Object.keys(touched).forEach((key) => (touched[key] = false));
  }

  return {
    values,
    errors,
    touched,
    submitting,
    isValid,
    validateField,
    validateAll,
    setFieldValue,
    setFieldTouched,
    reset,
  };
}
```

### 10.5.3 组合多个Hook

Vue 3组合式API的强大之处在于可以轻松组合多个自定义Hook。这种组合能力使得我们可以将复杂功能拆分为多个关注点单一的Hook，然后在需要时将它们组合在一起。

```javascript
// 组合多个Hook的示例
import { useAuth } from "@/composables/useAuth";
import { useFetch } from "@/composables/useFetch";
import { usePagination } from "@/composables/usePagination";

export function useUserList() {
  // 组合多个Hook
  const { currentUser } = useAuth();
  const { data, loading, error } = useFetch("/api/users");
  const { page, pageSize, currentPageData, setPage } = usePagination();

  // 在Hook之上构建业务逻辑
  const canCreateUser = computed(() => {
    return currentUser.value?.role === "admin";
  });

  async function createUser(userData) {
    // 实现创建用户的业务逻辑
  }

  return {
    users: currentPageData,
    loading,
    error,
    page,
    pageSize,
    canCreateUser,
    createUser,
    setPage,
  };
}
```

### 10.5.4 状态共享模式

自定义Hook支持多种状态共享模式。**独立实例模式**是最常用的，每次调用Hook都会创建独立的状态实例，互不影响。**全局单例模式**可以在整个应用中共享同一个状态。**依赖注入模式**可以通过参数传递共享状态。

```javascript
// 模式1：独立实例模式（默认）
function useCounter() {
  const count = ref(0);
  // 每个组件调用都获得独立的count
  return { count };
}

// 模式2：全局单例模式
const globalCount = ref(0);
export function useGlobalCounter() {
  return { count: globalCount };
}

// 模式3：依赖注入模式
export function useCounter(initialCount, countRef) {
  const count = countRef || ref(initialCount);
  return { count };
}

// 使用时注入共享状态
const sharedCount = ref(0);
const { count } = useCounter(0, sharedCount);
```

### 10.5.5 最佳实践

编写高质量的自定义Hook需要遵循一些最佳实践。首先，**保持单一职责**——每个Hook应该只关注一个特定的功能，不要在一个Hook中混合多个不相关的逻辑。其次，**显式返回依赖**——在Hook的文档或类型定义中说明它依赖哪些外部参数或配置。第三，**处理清理逻辑**——如果Hook中创建了需要清理的资源（如定时器、事件监听器），应该在Hook内部处理清理逻辑。第四，**提供合理的默认值**——对于可选参数，提供合理的默认值，使Hook更易于使用。

```javascript
// 遵循最佳实践的Hook示例
/**
 * 使用动画帧执行回调的Hook
 * @param {Function} callback - 动画回调函数
 * @param {boolean} autoStart - 是否立即开始动画
 * @returns {Object} 控制函数
 */
export function useAnimationFrame(callback, autoStart = false) {
  const isRunning = ref(false);
  let animationId = null;

  const start = () => {
    if (!isRunning.value) {
      isRunning.value = true;
      const loop = () => {
        if (!isRunning.value) return;
        callback();
        animationId = requestAnimationFrame(loop);
      };
      loop();
    }
  };

  const stop = () => {
    isRunning.value = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };

  // 可选自动开始
  if (autoStart) {
    start();
  }

  // 组件卸载时自动停止
  onUnmounted(stop);

  return {
    isRunning,
    start,
    stop,
  };
}
```

## 10.6 响应式API的性能优化与调试工具

### 10.6.1 响应式深度的选择

Vue 3的响应式系统默认为深度响应式，这意味着`reactive`创建的对象的所有嵌套属性都会变成响应式的。在大多数情况下，这是期望的行为，因为它提供了最便捷的开发体验。然而，在某些场景下，深度响应式可能带来不必要的性能开销。通过选择合适的API，可以优化应用的性能。

**`shallowReactive`** 只处理对象最外层属性的响应式，适用于对象结构比较深但变化时只有外层属性会改变的情况。

```javascript
// shallowReactive的使用
import { shallowReactive } from "vue";

// 使用shallowReactive
const state = shallowReactive({
  user: {
    profile: {
      name: "John",
      age: 25,
    },
  },
});

state.user.profile.name = "Jane"; // 不会触发响应式更新
state.user = { profile: { name: "Jane" } }; // 会触发响应式更新（外层变化）
```

**`shallowRef`** 只处理基本数据类型的响应式，不对对象类型进行深层响应式处理。当对象数据后续功能不会修改该对象的属性，而是生成新的对象来替换时，使用`shallowRef`可以避免不必要的响应式转换开销。

```javascript
// shallowRef的使用
import { shallowRef } from "vue";

const state = shallowRef({ count: 0 });

state.value.count++; // 不会触发响应式更新
state.value = { count: 1 }; // 会触发响应式更新
```

### 10.6.2 只读保护

`readonly`和`shallowReadonly`用于创建只读的响应式数据。这在需要保护数据不被意外修改时非常有用，例如配置对象、第三方库返回的数据等。

```javascript
// readonly的使用
import { reactive, readonly, shallowReadonly } from "vue";

// 创建响应式对象
const original = reactive({
  name: "John",
  age: 25,
  settings: {
    theme: "dark",
  },
});

// 创建只读副本
const readOnlyCopy = readonly(original);

// 尝试修改只读对象（开发环境会警告）
readOnlyCopy.name = "Jane"; // 警告：Set operation on key "name" failed...
readOnlyCopy.settings.theme = "light"; // 也会触发警告（深层只读）

// shallowReadonly只对第一层生效
const shallowCopy = shallowReadonly(original);
shallowCopy.name = "Jane"; // 警告
shallowCopy.settings.theme = "light"; // 不会警告（深层不是只读的）
```

### 10.6.3 性能优化的其他技巧

除了选择合适的响应式API外，还有其他一些性能优化技巧。

**使用`toRaw`跳过响应式转换**。`toRaw`可以将`reactive`创建的响应式对象转换为普通对象，这在需要执行大量非响应式操作时可以避免响应式系统的开销。

```javascript
// toRaw的使用
import { reactive, toRaw } from "vue";

const state = reactive({ count: 0 });

// 获取原始对象
const rawState = toRaw(state);

// 对原始对象的操作不会触发响应式更新
rawState.count++;

// 恢复响应式
state.count++; // 现在会触发更新
```

**使用`markRaw`标记不需要响应式的对象**。如果确定某个对象永远不需要响应式，可以先使用`markRaw`标记它，这样可以避免Proxy包装的开销。

```javascript
// markRaw的使用
import { reactive, markRaw } from "vue";

const obj = { name: "John" };
// 标记为不需要响应式
markRaw(obj);

const state = reactive({ user: obj });
// state.user将不会被转换为响应式
state.user.age = 25; // 直接修改，不会触发任何响应式更新
```

### 10.6.4 响应式数据判断API

Vue 3提供了多个用于判断响应式数据类型的工具函数，这些函数在调试和类型检查时非常有用。

```javascript
// 响应式数据判断API
import { isProxy, isReactive, isReadonly, isRef, toRaw } from "vue";

const original = { name: "John" };
const reactiveState = reactive(original);
const readonlyState = readonly(reactiveState);
const count = ref(0);

console.log(isProxy(reactiveState)); // true
console.log(isProxy(original)); // false
console.log(isReactive(reactiveState)); // true
console.log(isReactive(readonlyState)); // true（因为内部包装了reactive）
console.log(isReactive(readonly(original))); // false
console.log(isReadonly(readonlyState)); // true
console.log(isRef(count)); // true
console.log(isRef(reactiveState.count)); // false
```

### 10.6.5 Vue DevTools的调试支持

Vue 3对开发工具的支持更加完善，Vue DevTools可以正确显示组合式API创建的响应式数据、计算属性、自定义Hook等。通过DevTools，开发者可以直观地查看组件的响应式状态、跟踪依赖变化、调试性能问题。

```javascript
// 在DevTools中调试自定义Hook
import { defineStore } from "pinia";

// 自定义Hook会在DevTools中显示
export function useUserStore() {
  const user = ref(null);
  const loading = ref(false);

  async function fetchUser(id) {
    loading.value = true;
    try {
      user.value = await api.getUser(id);
    } finally {
      loading.value = false;
    }
  }

  return {
    user,
    loading,
    fetchUser,
  };
}
```

### 10.6.6 性能监控与追踪

Vue 3的`watchEffect`和`watch`支持`onTrack`和`onTrigger`选项，这些选项可以在开发和调试时用于追踪依赖的收集和触发情况。

```javascript
// 使用onTrack和onTrigger进行性能追踪
import { ref, watchEffect } from "vue";

const count = ref(0);
const doubled = ref(0);

watchEffect(
  () => {
    doubled.value = count.value * 2;
  },
  {
    onTrack(e) {
      console.log("依赖被跟踪:", e);
      // e.target - 目标对象
      // e.type - 操作类型（get/has/iterate）
      // e.key - 被访问的属性
    },
    onTrigger(e) {
      console.log("依赖被触发:", e);
      // e.target - 目标对象
      // e.type - 操作类型（set/add/delete/clear）
      // e.key - 被修改的属性
      // e.newValue - 新值
      // e.oldValue - 旧值
    },
  },
);

count.value++; // 触发onTrigger
console.log(doubled.value); // 触发onTrack
```

这些调试API在排查性能问题（如不必要的重新渲染、依赖收集异常）时非常有用。通过观察哪些依赖被跟踪和触发，开发者可以发现潜在的性能优化点。

## 本章小结

Vue 3的组合式API代表了Vue框架在组件设计范式上的重大演进。通过本章的学习，我们深入理解了组合式API相对于传统选项式API的优势：更灵活的逻辑组织方式、更好的逻辑复用机制、更完善的TypeScript支持、更高效的Tree-shaking优化。同时，我们也深入研究了Vue 3响应式系统的核心实现——基于Proxy的响应式机制，掌握了`reactive`、`ref`、`computed`、`watchEffect`等核心API的原理和使用方法。

组合式API不仅仅是一种新的语法，更是一种思考组件设计的新方式。它鼓励开发者将相关的逻辑聚合在一起，通过自定义Hook实现逻辑的跨组件复用，以函数式的风格编写更加清晰、可维护的代码。在实际项目中，我们应该根据组件的复杂度和团队的技术栈选择合适的API风格，或者在同一项目中混合使用两种风格。对于简单的组件，选项式API仍然是一个不错的选择；对于复杂的业务逻辑，组合式API能够提供更大的灵活性和可维护性。

掌握组合式API不仅能够让我们更好地使用Vue 3开发应用，还能够加深我们对现代前端框架设计思想的理解。这种以函数式编程为基础的组件设计理念，正在被越来越多的前端框架所采纳，代表了前端开发的一个重要趋势。

## 参考文献

[1] [Vue 3 Reactivity Core APIs](https://vuejs.org/api/reactivity-core) - 高可靠性 - Vue.js官方文档

[2] [Vue 3 Composition API Lifecycle](https://vuejs.org/api/composition-api-lifecycle) - 高可靠性 - Vue.js官方文档

[3] [Vue 3 Lifecycle Hooks Guide](https://vuejs.org/guide/essentials/lifecycle) - 高可靠性 - Vue.js官方文档

[4] [Vue 3 Composition API与Options API的对比](https://developer.aliyun.com/article/1580498) - 中等可靠性 - 阿里云开发者社区

[5] [Vue 3响应式原理与Proxy实现](https://juejin.cn/post/7237516248803688504) - 中等可靠性 - 掘金技术社区

[6] [Vue 3自定义Hooks设计模式](https://blog.csdn.net/h_t_d/article/details/134064559) - 中等可靠性 - CSDN技术博客

[7] [深入理解Vue 3响应式系统](https://zhuanlan.zhihu.com/p/575842038) - 中等可靠性 - 知乎专栏

[8] [Vue 3 Composition API实战指南](https://fruge365.blog.csdn.net/article/details/153964166) - 中等可靠性 - CSDN技术博客
