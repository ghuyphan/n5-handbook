
\<p align="center"\>
\<img src="./assets/siteIcon.png" alt="Japanese Language Handbook Logo" width="120"\>
\</p\>
\<h1 align="center"\>Japanese Language Handbook\</h1\>

> An interactive, multi-level web application to help you study Japanese. Start with the built-in **JLPT N5 and N4** material or **import your own custom study levels**. Features comprehensive study materials, progress tracking, a bilingual interface, and an integrated dictionary search.

-----

**🚀 [View the Live Demo](https://ghuyphan.github.io/n5-handbook/) 🚀**

-----

### Light & Dark Mode Preview

| Light Mode                                   | Dark Mode                                   |
| :------------------------------------------- | :------------------------------------------ |
| ![App Screenshot Light](./AppDemo-Light.png) | ![App Screenshot Dark](./AppDemo-Dark.png) |

## ✨ Features

This application has been rebuilt to be a flexible and powerful study tool.

  - **🗂️ Multi-Level System:**
      - Comes pre-loaded with a complete **JLPT N5** handbook.
      - Instantly switch between the default level and any custom levels you've imported.
      - Easily delete custom levels you no longer need with a dedicated button that appears right in the level switcher.
  - **⬆️ Import Custom Levels:**
      - Create your own study sets using a simple **CSV file structure**.
      - Use the in-app import tool to add new levels (e.g., N4, N3, or specialized vocabulary lists).
      - Imported levels are stored locally in your browser, so they're always available to you.
  - **💾 Persistent Local Data:**
      - The app uses **IndexedDB** to save all your data in the browser—no backend needed.
      - Progress (learned Kanji/Vocab) is saved **per level**.
      - Your preferred theme, language, current level, and pinned tab are remembered for your next visit.
  - **🌐 Bilingual Interface (EN/VI):**
      - Instantly switch the entire UI between **English** and **Vietnamese**.
      - Language preference is saved for your next session.
  - **🔍 Advanced Fuzzy Search:**
      - Instantly filter content within any tab using the search bar.
      - Powered by **Fuse.js** for intelligent, typo-tolerant searching across Japanese and English terms.
  - **📖 Integrated Dictionary Search:**
      - A dedicated tab for searching a comprehensive external dictionary.
      - Look up Japanese words, kanji, or English definitions.
      - Provides detailed results including readings, senses, and parts of speech.
  - **💡 Detailed Kanji View:**
      - Click on a Kanji card or a Kanji character within a dictionary result to open a detailed modal.
      - The modal provides rich information, including example words, mnemonics, radical data, and an example sentence with furigana.
  - **📊 Real-Time Progress Dashboard:**
      - Mark Kanji and Vocabulary as "learned" with a single click on a card.
      - The dashboard gives a visual overview of your mastery for each category within the current level.
      - Click any category in the dashboard to jump directly to that section for quick review.
  - **📌 Pin Your Favorite Tab:**
      - Set any main content tab (like *Kanji*, *Vocab*, or *Grammar*) as your default.
      - The app will automatically open your pinned tab on launch for the current level.
  - **🎨 Dual Themes & Responsive Design:**
      - Choose between a clean **Light Mode** and a sleek **Dark Mode**.
      - The layout is fully responsive, offering a polished experience on desktop, tablet, and mobile.

## 🛠️ How to Create and Import a Custom Level

You can extend the handbook by creating your own levels.

1.  **Prepare Your Data Files:**
    Create a folder for your new level (e.g., `my-n4-level`). Inside, create **CSV** files for the content you want to add. Supported filenames are:

      - `hiragana.csv`
      - `katakana.csv`
      - `kanji.csv`
      - `vocab.csv`
      - `grammar.csv`
      - `keyPoints.csv`

    You don't need to include all files—only the ones for the content you're adding. See the "CSV File Structure Guide" section below for detailed column requirements.

2.  **Use the Import Tool:**

      - Open the handbook application.
      - Open the sidebar (click the `☰` icon on mobile).
      - Click the **"Import New Level"** button.
      - In the modal window that appears:
          - Enter a unique, simple name for your level (e.g., `n4`, `business-vocab`). This name cannot already exist.
          - Drag-and-drop your CSV files onto the designated area, or click to open a file selector.
      - Click **"Import Level"**. The app will save your new level to the browser's database and switch to it automatically.

## 📝 CSV File Structure Guide

Each CSV file **must** include a header row with the exact column names specified below. The importer is case-sensitive and requires these exact names to work.

> **Important:** If any of your content (like an explanation or example sentence) contains a comma, you **must** wrap that entire piece of content in double quotes (`"`). This ensures the file is parsed correctly.
>
> **Example:** `"<b>Example:</b> 週末、映画を見に行こう。"`

### Hiragana & Katakana (`hiragana.csv` / `katakana.csv`)

| kana | romaji |
|------|--------|
| あ   | a      |
| い   | i      |

  - **kana:** The Hiragana or Katakana character(s).
  - **romaji:** The Romaji equivalent.

### Kanji (`kanji.csv`)

| kanji | onyomi | kunyomi | meaning\_en | meaning\_vi | radical\_en | radical\_vi | mnemonic\_en | mnemonic\_vi |
|-------|--------|---------|------------|------------|------------|------------|-------------|-------------|
| 日    | ニチ   | ひ      | day; sun   | ngày; mặt trời | Sun        | Mặt trời   | A sun has a single... | Mặt trời có một... |

  - **kanji:** The Kanji character.
  - **onyomi:** The On'yomi reading.
  - **kunyomi:** The Kun'yomi reading.
  - **meaning\_en / meaning\_vi:** The meaning in the respective language.
  - **radical\_en / radical\_vi:** The radical information.
  - **mnemonic\_en / mnemonic\_vi:** The mnemonic (memory aid).

> **Note:** Examples and sentence data are *not* currently supported for import via CSV for Kanji cards.

### Vocabulary (`vocab.csv`)

| word | reading | meaning\_en | meaning\_vi |
|------|---------|------------|------------|
| これ | これ    | this      | cái này   |
| それ | それ    | that      | cái đó    |

  - **word:** The Japanese vocabulary word (Kanji/Kana).
  - **reading:** The reading in Hiragana.
  - **meaning\_en / meaning\_vi:** The meaning in the respective language.

### Grammar (`grammar.csv`)

| title\_en       | content\_en                                 | title\_vi     | content\_vi                                   |
|----------------|--------------------------------------------|--------------|----------------------------------------------|
| Particle は    | "Marks the topic..."                       | Trợ từ は    | "Dùng để đánh dấu chủ đề..."                  |
| Particle の    | "Indicates possession..."                    | Trợ từ の    | "Chỉ sự sở hữu..."                           |

  - **title\_en / title\_vi:** The title of the grammar point.
  - **content\_en / content\_vi:** The explanation/examples (supports HTML).

### Key Points (`keyPoints.csv`)

| Kanji     | Reading | en         | vi    | Number |
|-----------|---------|------------|-------|--------|
| 上         | うえ    | up; above  | trên  |        |
| 下         | した    | down; below| dưới |        |
| 千         | せん    | thousand   | ngàn  | 1000   |

  - **Kanji:** The primary display character (optional).
  - **Reading:** The reading in Kana/Romaji.
  - **en / vi:** The translation in the respective language.
  - **Number:** The related number (optional).

> **Note:** Imported keyPoints will always display as a simple list.

## 💻 Setting Up Locally

To run the project locally, you need to have **Node.js** and **npm** installed.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/ghuyphan/n5-handbook.git
    cd n5-handbook
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Run the development server:**

    ```bash
    npm run watch
    ```

    This command will watch for changes in your CSS files and recompile them automatically.

4.  **Open with Live Server:**

      - Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension in VS Code.
      - Right-click `index.html` → "Open with Live Server".

## 🔧 Built With

  - **HTML5** & **CSS3**
  - **Vanilla JavaScript (ESM)**
  - **Tailwind CSS**
  - **JSON** for data structure

### Libraries

  - [idb](https://github.com/jakearchibald/idb) - A promise-based wrapper for IndexedDB.
  - [Fuse.js](https://fusejs.io/) - A powerful, lightweight fuzzy-search library.

## 🙏 Acknowledgements

  - Dictionary search functionality is powered by the official [**Jotoba**](https://jotoba.de/) API, with search results for Vietnamese supplemented by data from the excellent [**JDict**](https://jdict.net/) website.