"""Build dist/xerxes-pitch.pptx from the exported slide images and speaker notes.

Run tools/export.mjs first, then:  python presentation/tools/build_pptx.py   (needs python-pptx)

Each slide is one full-bleed 2x image, so it looks exactly like the HTML deck; the script and timing go in the
speaker notes. If assets/video/demo.mp4 exists, slide 3 uses its clip layout with the video placed over the phone.
"""
import json
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.util import Emu

DECK = Path(__file__).resolve().parents[1]
DIST = DECK / "dist"
VIDEO = DECK / "assets" / "video" / "demo.mp4"


def main() -> None:
    notes = json.loads((DIST / "notes.json").read_text(encoding="utf-8"))
    layout_file = DIST / "demo-layout.json"
    layout = json.loads(layout_file.read_text(encoding="utf-8")) if layout_file.exists() and VIDEO.exists() else None

    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 13.333 x 7.5 in, 16:9
    props = prs.core_properties  # replace the template's defaults
    props.title, props.subject = "Xerxes", "Pitch deck · Build with Agora, Bengaluru 2026"
    props.author = props.last_modified_by = "Xerxes"
    props.keywords = props.comments = ""
    blank = prs.slide_layouts[6]
    px = prs.slide_width / 1920  # EMU per CSS pixel of the 1920x1080 deck

    for i, n in enumerate(notes, start=1):
        slide = prs.slides.add_slide(blank)
        image = DIST / "jpg" / f"slide-{i:02d}.jpg"
        live = DIST / "jpg" / f"slide-{i:02d}-live.jpg"
        with_clip = layout is not None and layout["slide"] == i and live.exists()
        slide.shapes.add_picture(str(live if with_clip else image), 0, 0, prs.slide_width, prs.slide_height)

        if with_clip:
            r = layout["video"]
            poster = DIST / "jpg" / "demo-poster.jpg"
            with Image.open(live) as im:  # the clip's first frame as rendered in the phone
                k = im.width / 1920
                im.crop((round(r["x"] * k), round(r["y"] * k), round((r["x"] + r["width"]) * k), round((r["y"] + r["height"]) * k))).save(poster, quality=92)
            slide.shapes.add_movie(
                str(VIDEO), Emu(round(r["x"] * px)), Emu(round(r["y"] * px)), Emu(round(r["width"] * px)), Emu(round(r["height"] * px)),
                poster_frame_image=str(poster), mime_type="video/mp4",
            )

        slide.notes_slide.notes_text_frame.text = f"{n['time']} · {n['title']}\n\n{n['text']}"

    out = DIST / "xerxes-pitch.pptx"
    prs.save(out)
    print(f"{out}  ({out.stat().st_size / 1e6:.1f} MB, {len(notes)} slides{', clip embedded on slide ' + str(layout['slide']) if layout else ''})")


if __name__ == "__main__":
    main()
