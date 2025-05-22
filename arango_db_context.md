# ArangoDB Database Structure Context (newsDB2022)

## Overview
This file describes the actual structure of the ArangoDB instance `newsDB2022`, based on real data samples from all collections. Use this as the authoritative reference for writing queries, tools, or documentation.

---

## Collections and Sample Documents

#### circles
- **Purpose:** Graph nodes for custom graph structures.
- **Important Attributes:**
  - `_key`: unique node id
  - `label`: node label
- **Keywords:** graph, node, id, label
- **Best for:** Custom graph queries, node-based traversals
- **Sample Document:**
```json
{
  "_key": "A",
  "label": "1"
}
```

```json
{
  "_key": "B",
  "label": "2"
}
```

#### Article
- **Purpose:** Main news articles, with metadata and content summary.
- **Important Attributes:**
  - `_key`, `_id`: unique article id
  - `author`: author name
  - `category`, `subcategory`: topic tags
  - `date_added`: ISO date string
  - `default`: main metadata (see below)
    - `title`, `description`, `url`, `image`, `epoch_time`, `source`, `source_name`
  - `default_summary`: summary text
  - `origin_list`: country/region info
  - `read`: array of read events (date, description, etc.)
  - `source_tags`: topic/people/organization tags
- **Keywords:** news, summary, title, author, category, date, url, trending, tags
- **Best for:** News search, summaries, trending topics, author/category queries, article metadata
- **Sample Document:**
```json
{
  "_key": "726107124",
  "author": "Shubham Pandey",
  "category": ["sports"],
  "date_added": "2022-12-04T20:43:05Z",
  "default": {
    "date": "Sun, 18 Sep 2022 08:01:16 GMT",
    "description": "South Africa T20 League: Here's everythng you need to know about the auction of SA20, check below. ",
    "docID": "726107119",
    "epoch_time": 1663488076,
    "image": "https://english.cdn.zeenews.com/sites/default/files/2022/09/18/1091899-untitled-design-2022-09-18t132813.279.png",
    "image_large": "https://english.cdn.zeenews.com/sites/default/files/2022/09/18/1091899-untitled-design-2022-09-18t132813.279.png",
    "no_of_views": 0,
    "source": "zee_news",
    "source_category": ["cricket"],
    "source_name": "Zee News",
    "source_subcategory": ["cricket"],
    "thumbnail": {"*": "https://english.cdn.zeenews.com/sites/default/files/styles/zm_350x200/public/2022/09/18/1091899-untitled-design-2022-09-18t132813.279.png"},
    "title": "SA20 league player auction: Team purse, dates, venue, how to watch in India - all you need to know about South Africa T20 League auction",
    "url": "http://zeenews.india.com/cricket/sa20-league-player-auction-team-purse-dates-venue-how-to-watch-in-india-all-you-need-to-know-about-south-africa-t20-league-auction-2511524.html"
  },
  "default_image": "https://english.cdn.zeenews.com/sites/default/files/2022/09/18/1091899-untitled-design-2022-09-18t132813.279.png",
  "default_summary": "The South Africa T20 League auction will take place on September 19 (Monday) 316 players from 14 different countries will go under the hammer at the Cape Town International Convention Centre in Cape Town. The league will kick-start next year and is expected to attrack eyeballs from India as well. There are six teams which feature in the inaugural edition of the tournament. There is no T in the league as SA20 commissioner Graeme Smith says it 'shows our intention to be different'",
  "origin_list": ["India", "South Africa"],
  "read": [
    {
      "date": "Sun, 18 Sep 2022 08:01:16 GMT",
      "description": "South Africa T20 League: Here's everythng you need to know about the auction of SA20, check below. ",
      "docID": "726107119",
      "epoch_time": 1663488076,
      "image": "https://english.cdn.zeenews.com/sites/default/files/2022/09/18/1091899-untitled-design-2022-09-18t132813.279.png",
      "image_large": "https://english.cdn.zeenews.com/sites/default/files/2022/09/18/1091899-untitled-design-2022-09-18t132813.279.png",
      "no_of_views": 0,
      "source": "zee_news",
      "source_name": "Zee News",
      "thumbnail": {"*": "https://english.cdn.zeenews.com/sites/default/files/styles/zm_350x200/public/2022/09/18/1091899-untitled-design-2022-09-18t132813.279.png"},
      "title": "SA20 league player auction: Team purse, dates, venue, how to watch in India - all you need to know about South Africa T20 League auction",
      "url": "http://zeenews.india.com/cricket/sa20-league-player-auction-team-purse-dates-venue-how-to-watch-in-india-all-you-need-to-know-about-south-africa-t20-league-auction-2511524.html"
    }
  ],
  "read_source": ["zee_news"],
  "source_tags": ["SA20 league player auction", "SA20 auction", "SA20 auction Team purse", "SA20 auction dates", "SA20 auction venue", "all you need to know", "South Africa T20 League auction", "MI Cape Town", "Durban Super Giants", "Johannesburg Super Kings", "Paarl Royals", "Pretoria Capitals", "Sunrisers Eastern Cape"],
  "subcategory": ["cricket"]
}
```

#### Entity
- **Purpose:** Named entities for graph traversal (people, orgs, etc.).
- **Important Attributes:**
  - `_key`: unique entity id
  - `name`: entity name
  - `bert_schema`, `stanford_schema`: entity type (PERSON, ORG, etc.)
  - `label`: entity label
  - `ne_count`: frequency/count
- **Keywords:** entity, person, org, name, type, NER
- **Best for:** Entity linking, NER, graph/entity-based queries
- **Sample Document:**
```json
{
  "_key": "726107448",
  "bert_schema": ["PERSON"],
  "disambiguation": ["Ebrahim", "Raisi"],
  "label": ["named-entity"],
  "name": "ebrahim raisi",
  "ne_count": 260,
  "stanford_schema": ["PERSON"]
}
```

#### places
- **Purpose:** Place names for geospatial/entity linking.
- **Important Attributes:**
  - `_key`: place id
  - `label`: place name
- **Keywords:** place, location, geo, city, region
- **Best for:** Geospatial queries, location-based filtering
- **Sample Document:**
```json
{
  "_key": "Inverness",
  "label": "Inverness"
}
```

```json
{
  "_key": "Aberdeen",
  "label": "Aberdeen"
}
```

#### Document
- **Purpose:** Detailed articles, often with full content and author.
- **Important Attributes:**
  - `_key`, `_id`: unique document id
  - `author`: author name
  - `category`, `subcategory`: topic tags
  - `title`: document title
  - `description`: summary/description
  - `content`: full article text
  - `date_published`, `date_modified`: ISO date strings
  - `epoch_published`: unix timestamp
  - `image`, `thumbnail`: image URLs
  - `source`, `source_name`: publisher/source
  - `source_tags`: topic/people/organization tags
  - `url`: canonical url
- **Keywords:** document, fulltext, content, author, title, date, summary, url, tags
- **Best for:** Full content search, detailed reading, author/category/source queries, document-level analytics
- **Sample Document:**
```json
{
  "_key": "726106625",
  "_id": "Document/726106625",
  "_rev": "_js8SLWS---",
  "author": "Suparna Shree",
  "category": ["politics"],
  "content": "New Delhi: Protests erupted in Iran on Sunday over the death of Mahsa Amini, a 22-year-old woman, after her detention by the country's morality police, with women protesters cutting their hair and burning hijabs to protest the mandatory veiling of women, according to media reports. ...",
  "date_modified": "Mon, 19 Sep 2022 07:59:10 GMT",
  "date_published": "Mon, 19 Sep 2022 07:59:10 GMT",
  "description": "Protests erupted in Iran on Sunday over the death of Mahsa Amini, a 22-year-old woman, after her detention by the country's morality police, with women protesters cutting their hair and burning hijabs to protest the mandatory veiling of women.",
  "epoch_published": 1663574350,
  "image": "https://english.cdn.zeenews.com/sites/default/files/2022/09/19/1092240-iranian.jpg",
  "language": "English",
  "source": "zee_news",
  "source_name": "Zee News",
  "source_tags": ["Iranian women protest", "Iran", "protest", "Mahsa Amini"],
  "subcategory": ["general"],
  "thumbnail": {"*": "https://english.cdn.zeenews.com/sites/default/files/styles/zm_350x200/public/2022/09/19/1092240-iranian.jpg"},
  "title": "Iranian women protest over death of Mahsa Amini, chop off their hair and burns hijabs",
  "url": "http://zeenews.india.com/india/iranian-women-protest-over-death-of-mahsa-amini-chop-off-their-hair-and-burns-hijabs-2511837.html"
}
```

#### empty_content
- **Purpose:** News articles with minimal or missing content.
- **Important Attributes:**
  - `_key`: id
  - `title`: headline
  - `url`: link
  - `epoch_published`: timestamp
  - `source`: publisher
- **Keywords:** empty, minimal, missing, stub, title, url
- **Best for:** Detecting incomplete records, filtering out stubs
- **Sample Document:**
```json
{
  "_key": "726398528",
  "epoch_published": 1664530456,
  "source": "zee_news",
  "title": "'Jaane Tu... Ya Jaane Na' actor Ayaz Khan expecting first child with wife Jannat- PICS",
  "url": "http://zeenews.india.com/people/jaane-tu-ya-jaane-na-actor-ayaz-khan-expecting-first-child-with-wife-jannat-pics-2516195.html"
}
```

#### Users, youtubeMisc, vagrant_videos, vagrant_yt, RequestDoc
- **Purpose:** Present but currently empty (no sample documents).
- **Keywords:** user, video, request, misc
- **Best for:** (Currently not used)

---

### Edge Collections

#### edges
- **Purpose:** Links between `circles` nodes.
- **Important Attributes:**
  - `_from`, `_to`: node handles
  - `label`: edge label
  - `theTruth`, `theFalse`: boolean flags
- **Keywords:** edge, graph, from, to, label
- **Best for:** Graph traversals, node relationships
- **Sample Document:**
```json
{
  "_from": "circles/A",
  "_to": "circles/B",
  "theFalse": false,
  "theTruth": true,
  "label": "left_bar"
}
```

#### closeness
- **Purpose:** Similarity links between articles.
- **Important Attributes:**
  - `_from`, `_to`: article handles
  - `rel_type`: relation type (e.g., CR)
  - `sim_value`: similarity score
- **Keywords:** similarity, related, article, score, relation
- **Best for:** Finding related articles, similarity-based recommendations
- **Sample Document:**
```json
{
  "_from": "Article/726107124",
  "_to": "Article/726107240",
  "rel_type": "CR",
  "sim_value": 0.7407936025905371
}
```

#### article_entities
- **Purpose:** Links between articles and entities.
- **Important Attributes:**
  - `_from`: article handle
  - `_to`: entity handle
  - `a_type`: type of association
  - `bert_schema`, `stanford_schema`: entity type
  - `label`: label
- **Keywords:** article, entity, NER, association, label
- **Best for:** Article-entity linking, NER graph queries
- **Sample Document:**
```json
{
  "_from": "Article/726107285",
  "_to": "Entity/726107448",
  "a_type": "new",
  "bert_schema": ["PERSON"],
  "ep_count": 0,
  "ep_tf": 0,
  "hl_count": 0,
  "ht_count": 0,
  "label": ["named-entity"],
  "ne_count": 1,
  "ne_tf": 0.001557632398753894,
  "np_count": 0,
  "np_tf": 0,
  "origin_list": [["Iran"]],
  "sc_count": 0,
  "sc_tf": 0,
  "stanford_schema": ["PERSON"]
}
```

#### connections
- **Purpose:** General-purpose graph edges (details may vary).
- **Important Attributes:**
  - `_from`, `_to`: node handles
  - `travelTime`: numeric value (if present)
- **Keywords:** connection, edge, from, to, travel, time
- **Best for:** General graph traversals, custom edge queries
- **Sample Document:**
```json
{
  "_from": "places/Inverness",
  "_to": "places/Aberdeen",
  "travelTime": 3
}
```

---

## Field Types and Notes
- Most documents have an `_key` (string, unique).
- Edge collections always have `_from` and `_to` (ArangoDB document handles).
- Some fields (e.g., `read`, `watch`, `source_tags`) are arrays and may be empty.
- `default` objects may vary in fields but always include at least `docID` and `epoch_time`.
- Some collections (e.g., `Users`, `youtubeMisc`) are present but empty.

---

## Choosing the Right Collection & Tool: Keywords for Question Types
- **Article:** news, summary, trending, author, category, title, url, tags, metadata
- **Document:** fulltext, content, detailed, author, title, date, summary, analytics
- **Entity:** person, organization, NER, entity, name, type
- **places:** location, geo, city, region
- **edges/closeness/connections:** graph, related, similarity, relationship, traversal
- **empty_content:** minimal, missing, stub, incomplete

Use these keywords to match user questions to the right collection/tool for MCP server queries.

---

This file is auto-generated from real data samples. For new queries or tools, always refer to the actual field names/types here for accuracy.

---

## Recommendations for Tools (ArangoDB Context)

- Add tools for flexible querying of the `Document` collection, similar to those for `Article`:
  - `flexible_document_by_key`: Fetch a document by its key or _id.
  - `flexible_documents_by_date_range`: Return documents published within a date range, with limit/offset/detail/projection.
  - `flexible_fulltext_search_documents`: Search documents by text in title, description, or content, with flexible parameters.
  - `flexible_list_document_authors`: List unique authors from the Document collection.
  - `flexible_list_document_categories`: List unique categories/subcategories from the Document collection.

- For edge collections (such as `edges`, `closeness`, `connections`):
  - Add tools to fetch and traverse edges where either `_from` or `_to` is a `Document` node.
  - Example: `get_document_edges`: Return all edges connected to a given Document (by _id or _key), including the connected node's collection and id.

## Example Edge Query (for Document)

```aql
FOR edge IN edges
  FILTER edge._from LIKE 'Document/%' OR edge._to LIKE 'Document/%'
  LIMIT 1
  RETURN edge
```

## Note
- No edges were found in the current sample for `edges`, `closeness`, or `connections` collections with a `Document` node. If such edges exist, add tools to fetch and traverse them as described above.
