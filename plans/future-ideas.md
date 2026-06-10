
# Bilo — Feature Roadmap

> A focused, fast note-taking app for ultra-productive people.
> No fluff. Everything you need. Nothing you don't.

---

## ✅ IN SCOPE — This Session

### 1. `/diagram` — Mermaid chart support
A `/diagram` slash command opens a Mermaid editor block in the note.
Type any valid Mermaid syntax (flowchart, sequence, gantt, etc.) and it
renders live as a diagram. Click to toggle edit / rendered view.

### 2. Image support
- Paste images directly into a note (⌘V from clipboard)
- Drag & drop image files onto the editor
- Images stored as base64 data-URLs embedded in the note
- Displayed inline, max-width constrained, click to view full size

### 3. PDF attachment card
Attach a PDF file to a note via a `/pdf` slash command or drag-drop.
Renders as an inline card showing filename + size.
Click the card to open the PDF with the system default viewer.
Stored as a base64 blob or by file-system reference.

### 4. Remove dictation feature
The existing dictation/voice button is removed from the editor.
Rationale: users can use macOS native dictation (Fn Fn) instead.

### 5. AI on selected text (Smart Selection)
When text is selected in the editor, a floating mini-toolbar appears with options:
- **Improve** — rewrite for clarity
- **Fix grammar** — correct spelling/grammar
- **Summarize** — condense to bullet points
- **Shorter** / **Longer** — adjust verbosity
- **AI…** — custom prompt typed by the user
The AI response replaces the selection in-place.

### 6. Reminders on calendar
`@` reminders created within notes also appear as a distinct entry type
on the in-app calendar. Shown with a bell icon. Clicking navigates to
the parent note.

### 7. Cursor Agent trust fix
Auto-pass `--trust` to `cursor-agent` invocations so the interactive
directory-trust prompt never blocks the AI backend.

### 8. GitHub sync (cloud backup)
In Settings → Sync tab:
- Provide a GitHub private repo URL + personal access token
- Choose sync interval (manual / 5 min / 15 min / hourly)
- Notes exported as JSON and pushed as a commit
- Pull on app start to restore notes on a new device
Enables cross-device access without a proprietary cloud.

---

## 🗓 PLANNED — Future Sessions

### `/doodle` — Sketch pad
A minimal freehand drawing canvas embedded in a note block.
Pen / eraser / clear. Saved as SVG or PNG data-URL.

### Google Drive / OneDrive sync
OAuth-based cloud sync to a designated folder on Google Drive or OneDrive.
Toggle between providers in the Sync tab.

### Kiro ACP support
Alternative AI backend using the Kiro agent binary alongside Cursor ACP.
User chooses preferred agent in Settings → AI.

### In-note PDF viewer - I think this is already done.
Render PDFs natively inside the note using pdf.js rather than opening externally.


/ Totaly new ideas
git hub repo details: 
git branch -M main
git remote add origin git@github.com:DominikWawak/bilo.git
git push -u origin main

need to make a build for githib workflow to build the app every PR and make a artefact i can download 

make a proper release process for this, automate as much as possible
add dependabots that will upgrade libraries.


/caclulate function that will pop up a small calculator 