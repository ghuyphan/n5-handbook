# 🇯🇵 JLPT N5 Handbook

> A simple, interactive web application designed to help you study for the **JLPT N5** exam. Features comprehensive study materials, a real-time progress tracker, and a **bilingual interface (English/Vietnamese)**. The data is loaded dynamically from JSON files, making the app easily adaptable for other JLPT levels.

-----

**🚀 [View the Live Demo](https://ghuyphan.github.io/n5-handbook/) 🚀**

-----

### Light & Dark Mode Preview

| Light Mode | Dark Mode |
| :---: | :---: |
| ![App Screenshot Light](./AppDemo-Light.png) | ![App Screenshot Dark](./AppDemo-Dark.png) |

## ✨ Features

This application is packed with features to make your study session as effective as possible:

* **🌐 Bilingual Interface (EN/VI):** Instantly switch the entire user interface, including flashcard meanings and grammar notes, between **English** and **Vietnamese**. Your language preference is saved locally for your next visit.
* **📚 Data-Driven Content:** All study material is loaded from external `JSON` files, making the handbook easily expandable for N4, N3, etc. Content includes:
    * **🌸 Hiragana & 🤖 Katakana Charts:** Interactive and easy-to-read charts.
    * **🗓️ Time & Numbers:** Detailed tables for numbers, counters, days, and months.
    * **🗂️ Interactive Flashcards:** For `Kanji` and `Vocabulary`, categorized for focused learning. Just click to flip.
    * **📖 Collapsible Grammar Notes:** All essential N5 `Grammar` points are neatly organized.
* **📊 Real-Time Progress Tracking:** Mark Kanji and Vocabulary as "learned" and see your progress for each category in a real-time overview dashboard. Click any category in the dashboard to jump directly to it.
* **🎨 Dual Themes & Animated Controls:** Switch between a clean **Light Mode** and a sleek **Dark Mode**. Your theme choice is saved for your next session.
* **🔍 Universal Search:** Instantly filter content within the currently selected tab using the search bar.
* **✅ Zero Dependencies:** Built with simple HTML, CSS, and Vanilla JavaScript. No frameworks, no build process.
* **📱 Fully Responsive:** Study on your desktop, tablet, or phone. The layout adapts to any screen size, featuring a polished mobile experience with a slide-in sidebar.

## 🛠️ Setting Up Locally

Because the app now loads data from JSON files, you cannot run it by opening `index.html` directly in the browser due to security restrictions (CORS policy). You must serve the files from a local server.

The easiest way is using the **Live Server** extension in VS Code:
1.  Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension from the VS Code Marketplace.
2.  Right-click the `index.html` file in your project.
3.  Select **"Open with Live Server"**.

This will open the project correctly in your browser and allow it to fetch the data files.

## 💻 Built With

* **HTML5**
* **CSS3** (with a touch of Tailwind CSS for utility classes)
* **Vanilla JavaScript** - For all interactive logic, data rendering, and state management.
* **JSON** - For storing all language, vocabulary, kanji, and grammar data externally.

## 🌐 Deployment

This project is hosted on **GitHub Pages**.

To deploy your own version, simply push the entire project directory—including `index.html`, `styles.css`, `script.js`, and the `data` folder—to a GitHub repository. Then, enable GitHub Pages in the repository's settings (`Settings` > `Pages`) and set the source to deploy from the main branch. No build process is needed.