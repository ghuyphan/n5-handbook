# 🇯🇵 Japanese Language Handbook

> An interactive, multi-level web application to help you study Japanese. Start with the built-in **JLPT N5** material or **import your own custom study levels**. Features comprehensive study materials, per-level progress tracking, advanced fuzzy search, and a bilingual interface (English/Vietnamese).

-----

**🚀 [View the Live Demo](https://ghuyphan.github.io/n5-handbook/) 🚀**

-----

### Light & Dark Mode Preview

| Light Mode | Dark Mode |
| :---: | :---: |
| ![App Screenshot Light](./AppDemo-Light.png) | ![App Screenshot Dark](./AppDemo-Dark.png) |

## ✨ Features

This application has been rebuilt to be a flexible and powerful study tool.

* **🗂️ Multi-Level System:**
    * Comes pre-loaded with a complete **JLPT N5** handbook.
    * Switch between different levels instantly.
    * Delete custom levels you no longer need.

* **⬆️ Import Custom Levels:**
    * Create your own study sets using a simple JSON file structure.
    * Use the in-app import tool to add new levels (e.g., N4, N3, or specialized vocabulary lists) to your handbook.
    * Imported levels are stored locally in your browser, so they're always available to you.

* **💾 Persistent Local Data:**
    * The app uses **IndexedDB** to save all your data in the browser.
    * Progress (learned Kanji/Vocab) is saved **per level**.
    * Your preferred theme, language, and current level are remembered for your next visit.
    * Even your custom-imported levels are stored for long-term use.

* **🔍 Advanced Fuzzy Search:**
    * Instantly filter content within any tab.
    * Powered by **Fuse.js** for intelligent fuzzy searching.
    * Integrated with **Wanakana.js**, so you can search in English, Romaji, Hiragana, or Katakana, and it will find the right content.

* **📊 Real-Time Progress Dashboard:**
    * Mark Kanji and Vocabulary as "learned" with a single click.
    * The dashboard gives a visual overview of your mastery for each category within the current level.
    * Click any category in the dashboard to jump directly to that section for quick review.

* **🌐 Bilingual Interface (EN/VI):**
    * Instantly switch the entire UI between **English** and **Vietnamese**.
    * Language preference is saved for your next session.

* **🎨 Dual Themes & Responsive Design:**
    * Choose between a clean **Light Mode** and a sleek **Dark Mode**.
    * The layout is fully responsive, offering a polished experience on desktop, tablet, and mobile, complete with a slide-in sidebar and a unique "pin tab" feature for quick mobile access.

## 🛠️ How to Create and Import a Custom Level

You can extend the handbook by creating your own levels.

1.  **Prepare Your Data Files:**
    Create a folder for your new level (e.g., `my-n4-level`). Inside, create JSON files for the content you want to add. Supported filenames are:
    * `hiragana.json`
    * `katakana.json`
    * `kanji.json`
    * `vocab.json`
    * `grammar.json`
    * `timeNumbers.json`

    You don't need to include all files—only the ones for the content you're adding. The structure of these files should mirror the ones found in the `data/n5/` directory.

2.  **Use the Import Tool:**
    * Open the handbook application.
    * Click the hamburger menu icon (`☰`) to open the sidebar.
    * Click the **"Import New Level"** button.
    * In the modal window:
        * Enter a unique, simple name for your level (e.g., `n4`, `business-vocab`).
        * Drag-and-drop your JSON files (or click to select them).
    * Click **"Import Level"**. The app will save your new level and switch to it automatically.

## 💻 Setting Up Locally

Because the app loads data via `fetch()`, you cannot run it by opening `index.html` directly in the browser due to CORS policy. You must serve the files from a local server.

The easiest way is using the **Live Server** extension in VS Code:
1.  Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension.
2.  Right-click the `index.html` file in your project explorer.
3.  Select **"Open with Live Server"**.

## 🔧 Built With

* **HTML5** & **CSS3**
* **Vanilla JavaScript (ES6+)** - For all interactive logic, data rendering, and state management.
* **JSON** - For storing the base N5 level data.

### Libraries

* [**idb**](https://github.com/jakearchibald/idb) - A lightweight wrapper for IndexedDB, used for all local data persistence.
* [**Fuse.js**](https://fusejs.io/) - A powerful, lightweight fuzzy-search library.
* [**Wanakana**](https://wanakana.com/) - A utility for converting between Japanese Kana and Romaji, enhancing the search capability.

## 🌐 Deployment

This project is perfect for static hosting. It is currently hosted on **GitHub Pages**.

To deploy your own version, push the entire project directory—including `index.html`, `styles.css`, `script.js`, the library files, and the `data` folder—to a GitHub repository. Then, enable GitHub Pages in the repository's `Settings` > `Pages` and set the source to deploy from your main branch. No build process is needed.