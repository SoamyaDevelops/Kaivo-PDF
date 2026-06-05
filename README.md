# 📄 Kaivo PDF

> **Free, local-first PDF reader, editor, and converter built on Electron.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Web-blue.svg)](#installation)
[![Electron](https://img.shields.io/badge/Electron-v42.3-green.svg)](https://www.electronjs.org)

Kaivo PDF is a premium desktop application that brings a comprehensive suite of PDF tools directly to your machine. With a local-first philosophy, your documents never touch the cloud, ensuring complete privacy and fast offline processing.

> **Note:** The application currently supports Windows and Web environments out of the box. Support for macOS and Linux is available on request.

---

## ✨ Key Features

### 🔍 Interactive PDF Viewer
- **Fluid Layout**: Multi-page rendering with side-by-side or vertical scroll.
- **Sidebar Thumbnail Strip**: Quick page navigation with visual previews.
- **Zoom & Navigation**: Zoom in/out, custom scale adjustments, and single-click page flipping.
- **Selectable Text & Hybrid OCR**: Highlight, select, and copy text directly from digital PDFs, and automatically perform background OCR on-the-fly for scanned documents.
- **Built-in Print & Download**: Print directly or export changes.

### ✍️ Text-to-PDF Rich Editor
- **Advanced Editing**: Full format support including custom fonts, sizes, text styles (bold, italic, underline, strikethrough), and text alignments.
- **Dynamic Color Palettes**: Curated accent colors to make paragraphs pop.
- **Formatting Tools**: Ordered/unordered lists, indentation control, table insertion, and image insertion.
- **Page Layout Customization**: Select standard paper sizes (A4, A3, A5, Letter, Legal) and adjust margins (Normal, Narrow, Moderate, Wide, Minimal) with live page break backdrops.

### 🔄 Multi-Format File Converter
- **Convert to OCR**: OCR scanned/non-selectable PDF documents to generate fully searchable PDF files.
- **Image ➔ PDF**: Bundle multiple images (JPG, PNG, WEBP) into a single document.
- **PDF ➔ Image**: Export PDF pages as separate PNG files.
- **Merge & Split**: Combine multiple documents or slice a PDF into standalone pages.
- **Compress PDF**: Shrink file size while preserving high visual quality.
- **Excel ➔ PDF**: Turn `.xlsx`, `.xls`, or `.csv` sheets into PDF documents.

### 🗂️ Local Library & Management
- **Instant Rename**: Fast rename for active documents.
- **Export Presets**: Choose between **Flat PDF**, **PDF/A** (Archive), **Print-Ready**, or **Compressed** copies.
- **Recents Library**: Keep track of created and recently opened files in an offline catalog.
- **Personalized UI**: Toggle between a sleek light mode and a warm, custom dark theme.

---

## 🚀 Installation & Developer Guide

### Prerequisites
Make sure you have [Node.js](https://nodejs.org) (v18.x or v20.x recommended) installed on your system.

### 1. Clone the Repository
```bash
git clone https://github.com/Kaivo/kaivo-pdf.git
cd kaivo-pdf
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Development App
To launch the application locally in development mode:
```bash
npm start
```

### 4. Build Installers
To package the app into single-file production installers (primarily optimized for Windows, with Web support; macOS and Linux available on request):

* **Windows (NSIS & Portable x64)**
  ```bash
  npm run build:win
  ```
* **macOS (On Request)**
  ```bash
  npm run build:mac
  ```
* **Linux (On Request)**
  ```bash
  npm run build:linux
  ```
All output installers will be compiled into the `dist/` directory.

---

## 📂 Project Structure

```bash
kaivo-pdf/
├── .github/                 # GitHub workflows & issue/PR templates
├── dist/                    # Compiled distribution assets (gitignored)
├── node_modules/            # Node package dependencies (gitignored)
├── main.js                  # Electron main process (lifecycle & OS APIs)
├── preload.js               # IPC bridge exposing secure API context
├── index.html               # Main UI layer (HTML structure, CSS variables, client logic)
├── package.json             # Build commands, metadata, and dependencies
├── installer.nsh            # Windows NSIS Installer scripting configuration
├── LICENSE                  # MIT License
└── PRIVACY.md               # Local-first Privacy Policy
```

---

## 🛡️ Security & Privacy

Kaivo PDF is designed to be **100% offline-friendly**.
- No analytics or telemetry tracking.
- No remote server uploads.
- Your documents are processed entirely in memory or temporary local workspace directories.
- For more information, read our full [Privacy Policy](PRIVACY.md).

---

## 🤝 Contributing

We welcome contributions of all kinds! If you find a bug or want to suggest an enhancement:
1. Open an issue using the appropriate template in the [GitHub Issue Tracker](https://github.com/Kaivo/kaivo-pdf/issues).
2. For code changes, fork the repository, make your changes, and submit a Pull Request.

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
