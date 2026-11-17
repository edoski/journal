# Photos of his working

`photos.tsx`: a photo of his handwritten working goes with any answer: the boxes that start a lesson (New lesson, a course page's composer: the photo goes with the lesson's first message, and stays in the box until the lesson has opened), the lesson composer, a check's text answer (Explain, Recall, a question with no choices) and the practice problem's thinking. A photo alone is a message everywhere, a lesson's opening included. A photo waiting in any box survives a reload (`lesson/kept-drafts.md`).

## Getting a photo in

| Way | Where |
|---|---|
| Paste (⌘V) | the answer field; a photo copied on his iPhone pastes through Universal Clipboard |
| Drop | anywhere on the answer surface; the surface lights while a file is over it |
| Attach button | 32px quiet round icon (`ImagePlus`), first in the answer's toolbar row, tooltip "Attach a photo of your working ⌘⇧P" |
| ⌘⇧P (`attach-photo`) | opens the file picker of the answer surface on show |

macOS's Continuity Camera ("Take Photo", "Scan Documents") is not offered: Electron's web views do not take part in the macOS Services menu that carries it. HEIC files do not open in Chromium; the line under the thumbnails says to use a JPEG or PNG.

## Anatomy

| Slot | Element | Notes |
|---|---|---|
| pending | `data-testid="pending-photos"` | above the text field: 64px square thumbnails 8px apart, radius 8, a 20px round remove button on each corner ("Remove this photo") |
| error | `data-testid="photo-error"` | 12px muted line under the thumbnails: a photo that would not open, or a fifth photo |
| sent | `data-testid="sent-photos"` | on his message, the answered card and the practice card: 96px square thumbnails; a click opens the session overlay's photo mode (pan, zoom, Esc closes) |

The browser draws each photo upright on white, its long edge at most 2000px, as JPEG, before it is sent; the server reads its real type and resizes again under the model's inline limit. Four photos at most go with one answer.

A HEIC photo (an iPhone photo AirDropped or exported) is taken too: the browser cannot open it, so the box sends it to `/api/photos/heic`, where macOS's `sips` turns it into JPEG, then resizes it like any other photo (round 8). Away from a Mac it is refused in the usual words.
