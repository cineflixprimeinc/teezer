import { Fragment, type ReactNode } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

/**
 * Matches the server's own username-token grammar exactly - server/app/
 * Services/MentionService.php's extractUsernames(): `/@([a-zA-Z0-9._]+)/u`
 * (letters, digits, dot, underscore after "@"). Kept as one shared source
 * here so the caption always parses identically on both sides - what the
 * compose screen highlights while typing is exactly what the server will
 * actually resolve into a mention, and exactly what the feed will render
 * as tappable.
 */
const MENTION_SOURCE = "@([a-zA-Z0-9._]+)";

/**
 * Splits caption/comment text on @mentions and renders each one as
 * tappable, styled text - everything else renders as plain text,
 * unchanged. `key` namespaces React keys so this can be called more than
 * once on one screen (e.g. once per feed item) without collisions.
 */
export function renderMentionText(
  text: string,
  textStyle: StyleProp<TextStyle>,
  mentionStyle: StyleProp<TextStyle>,
  onPressMention: (username: string) => void,
  key: string,
): ReactNode {
  const re = new RegExp(MENTION_SOURCE, "g");
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      parts.push(
        <Text key={`${key}-t${i++}`} style={textStyle}>{text.slice(last, m.index)}</Text>,
      );
    }
    const username = m[1];
    parts.push(
      <Text
        key={`${key}-m${i++}`}
        style={mentionStyle}
        onPress={() => onPressMention(username)}
        suppressHighlighting
      >
        @{username}
      </Text>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<Text key={`${key}-t${i++}`} style={textStyle}>{text.slice(last)}</Text>);
  }
  return parts;
}

/**
 * Given the full text and the caret position, returns the in-progress
 * "@token" the caret is sitting inside (the part after "@", not
 * including it) - or null when the caret isn't inside a mention right
 * now (nothing typed yet, or a space/newline already closed it off).
 * Same character class as MENTION_SOURCE above, so what counts as "still
 * composing a mention" here matches what the parser will actually turn
 * into a tappable mention later.
 */
export function activeMentionToken(text: string, caret: number): string | null {
  const upToCaret = text.slice(0, caret);
  const m = /@([a-zA-Z0-9._]*)$/.exec(upToCaret);
  return m ? m[1] : null;
}

/**
 * Replaces the in-progress "@token" ending at `caret` with a completed
 * "@username " (trailing space so typing continues past it, not into
 * it), returning the new text and where the caret should land.
 */
export function completeMention(
  text: string,
  caret: number,
  username: string,
): { text: string; caret: number } {
  const upToCaret = text.slice(0, caret);
  const m = /@[a-zA-Z0-9._]*$/.exec(upToCaret);
  const start = m ? m.index : caret;
  const before = text.slice(0, start);
  const after = text.slice(caret);
  const inserted = `@${username} `;
  return { text: before + inserted + after, caret: before.length + inserted.length };
}
