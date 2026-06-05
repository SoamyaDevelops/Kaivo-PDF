; installer.nsh — NSIS custom installer script for Kaivo PDF v1.0.0
; Installs per-user (HKCU only) — NO admin/UAC prompt required on startup
; Supports clean install option to wipe previous settings

!macro customInstall
  ; ── Register .pdf file association under HKCU (no admin needed) ──────────
  WriteRegStr HKCU "Software\Classes\KaivoPDF.pdf" "" "PDF Document"
  WriteRegStr HKCU "Software\Classes\KaivoPDF.pdf\DefaultIcon" "" "$INSTDIR\resources\pdf-file-icon.ico"
  WriteRegStr HKCU "Software\Classes\KaivoPDF.pdf\shell\open\command" "" '"$INSTDIR\Kaivo PDF.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.pdf" "" "KaivoPDF.pdf"

  ; ── Register app capabilities (Windows Default Apps panel) ───────────────
  WriteRegStr HKCU "Software\Kaivo\KaivoPDF\Capabilities" "ApplicationName" "Kaivo PDF"
  WriteRegStr HKCU "Software\Kaivo\KaivoPDF\Capabilities" "ApplicationDescription" "Free PDF Reader and Editor"
  WriteRegStr HKCU "Software\Kaivo\KaivoPDF\Capabilities\FileAssociations" ".pdf" "KaivoPDF.pdf"
  WriteRegStr HKCU "Software\RegisteredApplications" "KaivoPDF" "Software\Kaivo\KaivoPDF\Capabilities"

  ; ── Refresh Windows shell (icon cache) ───────────────────────────────────
  System::Call 'shell32.dll::SHChangeNotify(l, l, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUninstall
  ; ── Clean install option: remove all user data/settings ──────────────────
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to perform a clean uninstall?$\n$\nYes — remove all settings, library data and preferences.$\nNo — keep your settings and library for future reinstalls." IDNO skip_clean
    ; Remove app user data (settings.json, drafts, etc.)
    RMDir /r "$APPDATA\kaivo-pdf"
    RMDir /r "$LOCALAPPDATA\kaivo-pdf"
    ; Remove registry settings
    DeleteRegKey HKCU "Software\Kaivo"
  skip_clean:

  ; ── Always remove file associations ──────────────────────────────────────
  DeleteRegKey HKCU "Software\Classes\KaivoPDF.pdf"
  DeleteRegValue HKCU "Software\RegisteredApplications" "KaivoPDF"
  ; Only remove .pdf association if it's still pointing to us
  ReadRegStr $0 HKCU "Software\Classes\.pdf" ""
  ${If} $0 == "KaivoPDF.pdf"
    DeleteRegKey HKCU "Software\Classes\.pdf"
  ${EndIf}

  ; ── Refresh shell ─────────────────────────────────────────────────────────
  System::Call 'shell32.dll::SHChangeNotify(l, l, i, i) v (0x08000000, 0, 0, 0)'
!macroend
