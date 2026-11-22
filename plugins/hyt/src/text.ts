/** 文本判定的共用部分：知识库入库门槛与风格预过滤都用同一套「有没有信息量」的判断。 */

const EMOJI =
  /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}\u{fe0f}\u{1f1e6}-\u{1f1ff}\u{2b00}-\u{2bff}\u{2190}-\u{21ff}\u{3030}\u{303d}\u{3297}\u{3299}]/gu

export function isEmojiOnly(value: string) {
  return value.replace(EMOJI, "").trim().length === 0
}

/** 纯链接：去掉 URL 与分隔标点后不剩任何文字。 */
export function isLinkOnly(value: string) {
  if (!/https?:\/\/\S+/i.test(value)) return false
  const stripped = value.replace(/https?:\/\/\S+/gi, "").replace(/[\s,，。;；]+/g, "")
  return stripped.length === 0
}

/** 全角转半角、去掉空白与标点、英文小写：只用于比较。 */
export function normalizeText(value: string) {
  return value
    .replace(/[\uff01-\uff5e]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
}

export function emojiCount(value: string) {
  return (value.match(EMOJI) ?? []).length
}
