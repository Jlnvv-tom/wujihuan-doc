# 第21章 综合实战项目三：个人 AI 知识库应用

企业级做完了，换个方向——做个人工具。个人AI知识库，把你的笔记、文档、收藏全部喂给AI，随时语义搜索，随时AI问答。

我是怕浪猫，这章做个人AI知识库。语义搜索、笔记管理、知识图谱、知识卡片，打造你的第二大脑。

---

## 21.1 需求分析

**个人知识管理的痛点**

| 痛点 | 现状 | 目标 |
|------|------|------|
| 笔记分散 | Notion/印象/本地文件 | 统一入口 |
| 找不到 | 关键词搜索不够 | 语义搜索 |
| 不关联 | 知识点孤立 | 知识图谱关联 |
| 不复习 | 学了就忘 | AI主动推送复习 |

**核心功能**

```
1. 多源导入 —— 导入Notion/印象/Markdown/PDF
2. 语义搜索 —— 向量检索，找意思不只是找关键词
3. AI问答 —— 基于个人知识库的问答
4. 知识图谱 —— 自动提取实体和关系
5. 每日回顾 —— AI生成复习卡片
6. 知识卡片 —— 双链笔记+卡片式展示
```

---

## 21.2 多源导入

**Notion导入**

```python
# services/importers/notion_importer.py
import requests

class NotionImporter:
    def __init__(self, notion_token):
        self.notion_token = notion_token
        self.headers = {
            'Authorization': f'Bearer {notion_token}',
            'Notion-Version': '2022-06-28'
        }
    
    def import_all(self, user_id):
        """导入所有Notion页面"""
        # 获取所有页面
        pages = self._get_all_pages()
        
        imported = 0
        for page in pages:
            # 获取页面内容
            blocks = self._get_blocks(page['id'])
            
            # 转换为Markdown
            markdown = self._blocks_to_markdown(blocks)
            
            # 保存到知识库
            note = Note(
                user_id=user_id,
                title=page['properties'].get('title', {}).get('plain_text', '未命名'),
                content=markdown,
                source='notion',
                source_id=page['id'],
                source_url=page['url']
            )
            db.session.add(note)
            imported += 1
        
        db.session.commit()
        
        # 异步向量化
        vectorize_notes.delay(user_id)
        
        return {'imported': imported}
    
    def _get_all_pages(self):
        """获取所有页面"""
        url = 'https://api.notion.com/v1/search'
        payload = {'page_size': 100}
        
        response = requests.post(url, headers=self.headers, json=payload)
        return response.json().get('results', [])
    
    def _get_blocks(self, page_id):
        """获取页面内容块"""
        url = f'https://api.notion.com/v1/blocks/{page_id}/children'
        response = requests.get(url, headers=self.headers)
        return response.json().get('results', [])
    
    def _blocks_to_markdown(self, blocks):
        """Notion块转Markdown"""
        markdown_parts = []
        
        for block in blocks:
            block_type = block['type']
            
            if block_type == 'paragraph':
                text = self._extract_text(block['paragraph']['rich_text'])
                markdown_parts.append(text)
            elif block_type == 'heading_1':
                text = self._extract_text(block['heading_1']['rich_text'])
                markdown_parts.append(f'# {text}')
            elif block_type == 'heading_2':
                text = self._extract_text(block['heading_2']['rich_text'])
                markdown_parts.append(f'## {text}')
            elif block_type == 'heading_3':
                text = self._extract_text(block['heading_3']['rich_text'])
                markdown_parts.append(f'### {text}')
            elif block_type == 'bulleted_list_item':
                text = self._extract_text(block['bulleted_list_item']['rich_text'])
                markdown_parts.append(f'- {text}')
            elif block_type == 'numbered_list_item':
                text = self._extract_text(block['numbered_list_item']['rich_text'])
                markdown_parts.append(f'1. {text}')
            elif block_type == 'code':
                text = self._extract_text(block['code']['rich_text'])
                language = block['code'].get('language', '')
                markdown_parts.append(f'```{language}\n{text}\n```')
            elif block_type == 'quote':
                text = self._extract_text(block['quote']['rich_text'])
                markdown_parts.append(f'> {text}')
        
        return '\n\n'.join(markdown_parts)
    
    def _extract_text(self, rich_text):
        """提取富文本内容"""
        return ''.join([t['plain_text'] for t in rich_text])
```

**Markdown文件导入**

```python
class MarkdownImporter:
    def import_directory(self, user_id, directory_path):
        """导入Markdown目录"""
        imported = 0
        
        for root, dirs, files in os.walk(directory_path):
            for filename in files:
                if filename.endswith('.md'):
                    filepath = os.path.join(root, filename)
                    
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # 提取标题
                    title = self._extract_title(content, filename)
                    
                    note = Note(
                        user_id=user_id,
                        title=title,
                        content=content,
                        source='markdown',
                        source_path=filepath
                    )
                    db.session.add(note)
                    imported += 1
        
        db.session.commit()
        vectorize_notes.delay(user_id)
        
        return {'imported': imported}
    
    def _extract_title(self, content, filename):
        """从Markdown提取标题"""
        lines = content.split('\n')
        for line in lines:
            if line.startswith('# '):
                return line[2:].strip()
        return os.path.splitext(filename)[0]
```

---

## 21.3 语义搜索

**向量检索实现**

```python
# services/semantic_search.py
from openai import OpenAI

class SemanticSearchService:
    def __init__(self):
        self.client = OpenAI()
        self.embedding_model = 'text-embedding-3-small'
    
    def index_note(self, note_id, content):
        """索引笔记"""
        # 分块
        chunks = self._chunk_content(content)
        
        # 向量化
        embeddings = self._get_embeddings(chunks)
        
        # 存储到向量库
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            vector_record = NoteVector(
                note_id=note_id,
                chunk_index=i,
                content=chunk,
                embedding=embedding
            )
            db.session.add(vector_record)
        
        db.session.commit()
    
    def search(self, query, user_id, top_k=10, threshold=0.7):
        """语义搜索"""
        # 向量化查询
        query_embedding = self._get_embeddings([query])[0]
        
        # 向量检索
        results = self._vector_search(query_embedding, user_id, top_k)
        
        # 过滤低分结果
        filtered = [r for r in results if r['score'] >= threshold]
        
        return filtered
    
    def _get_embeddings(self, texts):
        """获取文本向量"""
        response = self.client.embeddings.create(
            model=self.embedding_model,
            input=texts
        )
        return [item.embedding for item in response.data]
    
    def _chunk_content(self, content, chunk_size=500, overlap=100):
        """分块"""
        chunks = []
        for i in range(0, len(content), chunk_size - overlap):
            chunk = content[i:i + chunk_size]
            if chunk.strip():
                chunks.append(chunk)
        return chunks
    
    def _vector_search(self, query_embedding, user_id, top_k):
        """向量搜索（使用pgvector）"""
        sql = text("""
            SELECT 
                nv.note_id,
                nv.content,
                n.title,
                1 - (nv.embedding <=> :query_embedding) as score
            FROM note_vectors nv
            JOIN notes n ON nv.note_id = n.id
            WHERE n.user_id = :user_id
            ORDER BY nv.embedding <=> :query_embedding
            LIMIT :top_k
        """)
        
        results = db.session.execute(sql, {
            'query_embedding': str(query_embedding),
            'user_id': user_id,
            'top_k': top_k
        }).fetchall()
        
        return [{
            'note_id': r.note_id,
            'title': r.title,
            'content': r.content,
            'score': float(r.score)
        } for r in results]
```

---

## 21.4 知识图谱

**实体提取**

```python
class KnowledgeGraphService:
    def __init__(self):
        self.llm_service = LLMService()
    
    def extract_entities(self, note_id):
        """从笔记中提取实体和关系"""
        note = Note.query.get(note_id)
        
        prompt = f"""从以下文本中提取实体和关系，返回JSON格式。

文本：
{note.content}

返回格式：
{{
    "entities": [
        {{"name": "实体名", "type": "人物|技术|概念|工具|项目", "description": "描述"}}
    ],
    "relations": [
        {{"source": "实体1", "target": "实体2", "type": "关系类型"}}
    ]
}}"""
        
        result = self.llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model="gpt-4o-mini",
            temperature=0
        )
        
        try:
            data = json.loads(result)
            
            # 保存实体
            for entity_data in data.get('entities', []):
                entity = Entity(
                    note_id=note_id,
                    name=entity_data['name'],
                    type=entity_data['type'],
                    description=entity_data.get('description', '')
                )
                db.session.add(entity)
            
            # 保存关系
            for relation_data in data.get('relations', []):
                relation = EntityRelation(
                    note_id=note_id,
                    source_entity=relation_data['source'],
                    target_entity=relation_data['target'],
                    relation_type=relation_data['type']
                )
                db.session.add(relation)
            
            db.session.commit()
            
            return data
        except json.JSONDecodeError:
            return {'entities': [], 'relations': []}
    
    def get_graph(self, user_id, entity_name=None):
        """获取知识图谱"""
        query = Entity.query.filter(Entity.note_id.in_(
            Note.query.filter_by(user_id=user_id).with_entities(Note.id)
        ))
        
        if entity_name:
            query = query.filter(Entity.name.ilike(f'%{entity_name}%'))
        
        entities = query.all()
        entity_names = [e.name for e in entities]
        
        relations = EntityRelation.query.filter(
            EntityRelation.source_entity.in_(entity_names),
            EntityRelation.target_entity.in_(entity_names)
        ).all()
        
        return {
            'nodes': [{'name': e.name, 'type': e.type, 'description': e.description} for e in entities],
            'edges': [{'source': r.source_entity, 'target': r.target_entity, 'type': r.relation_type} for r in relations]
        }
```

**前端图谱可视化**

```vue
<!-- components/KnowledgeGraph.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import * as d3 from 'd3'
import { knowledgeAPI } from '@/api/knowledge'

const props = defineProps({
  userId: Number,
  entityName: String
})

const svgRef = ref(null)

const renderGraph = (data) => {
  const width = 800
  const height = 600
  
  const svg = d3.select(svgRef.value)
    .attr('width', width)
    .attr('height', height)
  
  svg.selectAll('*').remove()
  
  const simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.edges).id(d => d.name).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
  
  // 绘制边
  const link = svg.append('g')
    .selectAll('line')
    .data(data.edges)
    .join('line')
    .attr('stroke', '#999')
    .attr('stroke-width', 1)
  
  // 绘制节点
  const node = svg.append('g')
    .selectAll('circle')
    .data(data.nodes)
    .join('circle')
    .attr('r', 8)
    .attr('fill', d => getNodeColor(d.type))
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended))
  
  // 节点标签
  const label = svg.append('g')
    .selectAll('text')
    .data(data.nodes)
    .join('text')
    .text(d => d.name)
    .attr('font-size', 10)
  
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)
    
    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
    
    label
      .attr('x', d => d.x + 10)
      .attr('y', d => d.y + 4)
  })
}

const getNodeColor = (type) => {
  const colors = { '人物': '#4f46e5', '技术': '#06b6d4', '概念': '#10b981', '工具': '#f59e0b', '项目': '#ef4444' }
  return colors[type] || '#999'
}

onMounted(async () => {
  const res = await knowledgeAPI.getGraph({ entity_name: props.entityName })
  renderGraph(res.data)
})
</script>

<template>
  <svg ref="svgRef"></svg>
</template>
```

---

## 21.5 每日回顾与知识卡片

**间隔重复算法**

```python
# services/review_service.py
import math

class ReviewService:
    def __init__(self):
        self.default_easiness = 2.5
        self.minimum_easiness = 1.3
    
    def calculate_next_review(self, card, quality):
        """SM-2算法计算下次复习时间
        
        quality: 0-5，5=完美，0=完全忘记
        """
        if quality < 3:
            # 复习失败，重新开始
            card.repetition = 0
            card.interval = 1
        else:
            if card.repetition == 0:
                card.interval = 1
            elif card.repetition == 1:
                card.interval = 6
            else:
                card.interval = round(card.interval * card.easiness)
            
            card.repetition += 1
        
        # 更新难度
        card.easiness = max(
            self.minimum_easiness,
            card.easiness + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
        )
        
        card.next_review = datetime.utcnow() + timedelta(days=card.interval)
        card.last_review = datetime.utcnow()
        
        db.session.commit()
        return card
    
    def get_due_cards(self, user_id, limit=10):
        """获取到期复习卡片"""
        cards = ReviewCard.query.filter(
            ReviewCard.user_id == user_id,
            ReviewCard.next_review <= datetime.utcnow()
        ).order_by(ReviewCard.next_review).limit(limit).all()
        
        return cards
    
    def generate_card_from_note(self, note_id):
        """从笔记生成复习卡片"""
        note = Note.query.get(note_id)
        
        prompt = f"""根据以下笔记内容，生成3张复习卡片，每张包含问题和答案。

笔记内容：
{note.content[:2000]}

返回JSON格式：
[
    {{"question": "问题", "answer": "答案", "hint": "提示"}},
    ...
]"""
        
        result = self.llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model="gpt-4o-mini",
            temperature=0.3
        )
        
        cards_data = json.loads(result)
        
        for card_data in cards_data:
            card = ReviewCard(
                note_id=note_id,
                user_id=note.user_id,
                question=card_data['question'],
                answer=card_data['answer'],
                hint=card_data.get('hint', ''),
                easiness=self.default_easiness,
                repetition=0,
                interval=0,
                next_review=datetime.utcnow()
            )
            db.session.add(card)
        
        db.session.commit()
```

---

## 21.6 双链笔记

**双链数据模型**

```python
class NoteLink(db.Model):
    __tablename__ = 'note_links'
    
    id = db.Column(db.Integer, primary_key=True)
    source_note_id = db.Column(db.Integer, db.ForeignKey('notes.id'))
    target_note_id = db.Column(db.Integer, db.ForeignKey('notes.id'))
    link_text = db.Column(db.String(200))  # 链接文本
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**双链自动提取**

```python
class NoteLinkService:
    def extract_links(self, note_id):
        """从笔记中提取双向链接"""
        note = Note.query.get(note_id)
        
        # 匹配 [[笔记标题]] 格式
        import re
        link_pattern = r'\[\[(.*?)\]\]'
        matches = re.findall(link_pattern, note.content)
        
        for link_text in matches:
            # 查找目标笔记
            target = Note.query.filter(
                Note.user_id == note.user_id,
                Note.title.ilike(f'%{link_text}%')
            ).first()
            
            if target:
                # 创建双向链接
                existing = NoteLink.query.filter_by(
                    source_note_id=note_id,
                    target_note_id=target.id
                ).first()
                
                if not existing:
                    link = NoteLink(
                        source_note_id=note_id,
                        target_note_id=target.id,
                        link_text=link_text
                    )
                    db.session.add(link)
        
        db.session.commit()
    
    def get_backlinks(self, note_id):
        """获取反向链接"""
        return NoteLink.query.filter_by(target_note_id=note_id).all()
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 多源导入 | Notion API + Markdown + PDF |
| 语义搜索 | Embedding + pgvector + 分块检索 |
| 知识图谱 | LLM实体提取 + D3.js可视化 |
| 每日回顾 | SM-2间隔重复 + AI生成卡片 |
| 双链笔记 | [[标题]]语法 + 自动提取 |

---

觉得有用？收藏起来，下次直接照抄。

你的个人知识管理用什么工具？评论区聊聊。

关注怕浪猫，下期我们做综合实战项目四——AI驱动的自动化测试平台。

系列进度 21/23

**下章预告：** 第22章综合实战项目四——AI驱动的自动化测试平台，自动生成测试用例、智能Bug分析、回归测试优化，让QA工作更高效。
