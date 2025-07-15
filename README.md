
<p align="center">
  <img src="./assets/siteIcon.png" alt="JLPT Handbook Logo" width="120">
</p>
<h1 align="center">JLPT Handbook</h1>

> An interactive, multi-level web application to help you study Japanese. Start with the built-in **JLPT N5 and N4** material or **import your own custom study levels**. Features comprehensive study materials, progress tracking, a bilingual interface, and an integrated dictionary search.

---

**🚀 [View the Live Demo](https://ghuyphan.github.io/n5-handbook/) 🚀**

---

### Light & Dark Mode Preview

| Light Mode                                   | Dark Mode                                   |
| :------------------------------------------- | :------------------------------------------ |
| ![App Screenshot Light](./AppDemo-Light.png) | ![App Screenshot Dark](./AppDemo-Dark.png) |

## ✨ Features
* **🗂️ Multi-Level System**
* **⬆️ Import Custom Levels**
* **💾 Persistent Local Data**
* **🌐 Bilingual Interface (EN/VI)**
* **🔍 Advanced Fuzzy Search**
* **📖 Integrated Dictionary Search**
* **💡 Detailed Kanji View**
* **📊 Real-Time Progress Dashboard**
* **📌 Pin Your Favorite Tab**
* **📝 Notes**
* **🎨 Dual Themes & Responsive Design**

## 🛠️ How to Create and Import a Custom Level
1.  **Prepare Your Data Files:**
    - Create CSV files using **semicolon (`;`)** as delimiter
    - Enclose fields containing special characters in **double quotes (`"`)**
    - Supported filenames:
      - `hiragana.csv`
      - `katakana.csv`
      - `kanji.csv`
      - `vocab.csv`
      - `grammar.csv`
      - `keyPoints.csv`

2.  **Use the Import Tool:**
    - Open sidebar → Click **"Import New Level"**
    - Enter unique level name (lowercase alphanumeric + hyphens)
    - Drag-and-drop your CSV files
    - Click **"Import Level"**

## 📝 CSV File Structure Guide (Critical Updates)

> **⚠️ Format Requirements:**
> - **Delimiter:** Semicolon (`;`)
> - **Text Qualifier:** Double quotes (`"`) for fields containing special characters
> - **Encoding:** UTF-8
> - **Language Columns:** Must use `_en` (English) and `_vi` (Vietnamese) suffixes

### Kanji (`kanji.csv`)
| kanji | onyomi | kunyomi | meaning_en | meaning_vi | radical_en | radical_vi | mnemonic_en | mnemonic_vi |
|-------|---------|---------|------------|------------|------------|------------|-------------|-------------|
| 水    | スイ    | みず    | water      | nước       | Water      | Nước       | Water droplets | Giọt nước |

> **Note:** Examples and sentence data are not currently supported for import

### Vocabulary (`vocab.csv`)
| word | reading | meaning_en | meaning_vi |
|------|---------|------------|------------|
| 猫   | ねこ    | cat        | con mèo    |
| 犬   | いぬ    | dog        | con chó    |

### Grammar (`grammar.csv`)
| pattern_en | pattern_vi | structure | explanation_en | explanation_vi |
|------------|------------|-----------|----------------|----------------|
| 〜ませんか | 〜ませんか | Verb stem + ませんか | Would you like to...? | Bạn có muốn...? |

### Hiragana/Katakana (`hiragana.csv`/`katakana.csv`)
| kana | romaji |
|------|--------|
| あ   | a      |
| い   | i      |

### Key Points (`keyPoints.csv`)
| Kanji | Reading | en      | vi        |
|-------|---------|---------|-----------|
| 上    | うえ    | up      | trên      |
| 下    | した    | down    | dưới      |

### Required Formatting Rules:
1. **Language Columns:**
   ```csv
   meaning_en;meaning_vi
   "cat;con mèo"
   ```
   
2. **Special Characters:**
   ```csv
   explanation_en;explanation_vi
   "Use when; asking questions";"Dùng khi; đặt câu hỏi"
   ```
   
3. **Header Requirements:**
   ```csv
   word;reading;meaning_en;meaning_vi
   猫;ねこ;cat;con mèo
   ```

## 💻 Setting Up Locally
```bash
git clone https://github.com/ghuyphan/n5-handbook.git
cd n5-handbook
npm install
npm run watch
# Open index.html with Live Server
```

## 🔧 Built With
* HTML5 & CSS3
* Vanilla JavaScript (ESM)
* Tailwind CSS
* [wanakana](https://wanakana.com/)
* [Fuse.js](https://fusejs.io/)
* [idb](https://github.com/jakearchibald/idb)

## 🙏 Acknowledgements
* Dictionary data from [Jotoba](https://jotoba.de/) and [JDict](https://jdict.net/)
```