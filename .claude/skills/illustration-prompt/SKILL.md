---
name: illustration-prompt
description: Write the image-generation prompt for a text's header illustration — derive a SCENE DESCRIPTION from the German text in content/texts/, paste it into the house prompt template and save it to content/illustration-prompts/<slug>.md, ready to paste into an image generator. Use whenever a picture, illustration or image prompt is asked for for one of the texts.
---

# Illustration prompt for a text

The header illustrations all come from one prompt; only the scene changes. This
skill writes that scene from the text and hands back the finished prompt. It
generates nothing itself — the output is text for the user to paste into an
image generator.

## Steps

1. **Find the text.** The argument is a slug, a title or a reference to the text
   just written (`content/texts/<slug>.md`). Read the whole of it, not just the
   opening — the scene has to be true to the text a reader will have in front of
   it. If the argument matches nothing, list the slugs and ask which one.
2. **Write the SCENE DESCRIPTION**, to the rules below.
3. **Fill the template.** Read `prompt-template.md` beside this file and replace
   the line `[INSERT THE SPECIFIC SCENE OR STORY DESCRIPTION HERE]` with the
   scene. Change nothing else in it.
4. **Save the result to `content/illustration-prompts/<slug>.md`** — the filled
   template and nothing else, no heading, no code fence, no commentary before or
   after it. That directory holds one prompt per text, alongside
   `generated-images/`, where the raw output lands once the user has generated
   the picture from it — a separate step from this skill, not something it does
   itself. Tell the user in the chat where the file was written; do not also
   paste the prompt there.

## Writing the scene description

Three to six sentences, present tense, one moment in time. Not a summary of the
text: one frame out of it.

- **Choose the moment that says what the text is about** and can be seen — the
  bicycle out of the cellar with its parts on the garage floor, the bakehouse at
  three in the morning. A text's opening is usually it, but not always.
- **Honour the text's facts.** Season, time of day, how many people, what they
  are wearing, the objects it names. The picture stands directly above the
  prose, so a contradiction is read as a mistake.
- **Nothing that depends on writing.** The prompt forbids letters anywhere in
  the image, so a scene whose point is a notice, a sign, a price tag or a book's
  title has to be staged some other way, or another moment chosen.
- **Say what fills the width.** The format is 3:1, so name what carries the left
  and right thirds — a row of houses, a field, a shelf, a river bank — and put
  the main figure slightly off-centre.
- **Concrete nouns, large shapes.** The style is flat and simplified; anything
  that needs fine detail to read (an expression, a mechanism, a crowd) will not
  survive it. No abstractions, no brand names, no real people.
- **Name the light and the mood in a few words**, not a lighting setup: a grey
  winter morning, warm lamplight in a dark room.
- Write it in English, like the rest of the prompt.

Turning the generated picture into what the site actually uses — the WebP
conversion and the front matter — is a separate request; see CLAUDE.md under
*Adding a text*.
