/**
 * 注入到内嵌页面的定位 helper。只用可见文案、aria-label / placeholder / name 与结构，不依赖任何带 hash 的
 * class；每个函数都能在目标不存在时返回假值，由调用方给出可读的错误。
 */
export const helpers = `(() => {
  const norm = (value) => (value == null ? "" : String(value)).replace(/\\s+/g, " ").trim()
  const visible = (el) => {
    if (!el || !el.isConnected) return false
    const style = window.getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const textOf = (el) => norm(el && (el.innerText || el.textContent))
  const ownText = (el) => norm(Array.from(el.childNodes).filter((node) => node.nodeType === 3).map((node) => node.textContent).join(" "))
  const controlSelector = 'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="textbox"]'

  const itemOf = (el) => {
    let node = el
    for (let depth = 0; node && depth < 6; depth++) {
      if (node.matches && node.matches('.el-form-item, .ant-form-item, .form-item, [role="group"], tr')) return node
      node = node.parentElement
    }
    return el.parentElement
  }

  const labelOf = (el) => {
    const aria = norm(el.getAttribute("aria-label"))
    if (aria) return aria
    const placeholder = norm(el.getAttribute("placeholder"))
    const id = el.getAttribute("id")
    if (id) {
      const explicit = document.querySelector('label[for="' + CSS.escape(id) + '"]')
      if (explicit) return norm(textOf(explicit))
    }
    const item = itemOf(el)
    if (item) {
      const label = item.querySelector('label, .el-form-item__label, .ant-form-item-label, [class*="label"]')
      const text = label ? textOf(label) : ""
      if (text) return text
      const heading = item.querySelector('[class*="title"], [class*="name"]')
      if (heading && heading !== el) {
        const value = textOf(heading)
        if (value && value.length <= 60) return value
      }
    }
    return placeholder
  }

  const kindOf = (el) => {
    if (el.isContentEditable) return "richtext"
    if (el.tagName === "SELECT") return "select"
    if (el.tagName === "TEXTAREA") return "textarea"
    const role = (el.getAttribute("role") || "").toLowerCase()
    if (role === "combobox") return "select"
    const type = (el.getAttribute("type") || "text").toLowerCase()
    if (type === "checkbox") return "checkbox"
    if (type === "radio") return "radio"
    if (type === "time") return "time"
    if (type === "date") return "date"
    const wrapper = el.closest('.el-select, .ant-select, [class*="select"]')
    if (wrapper) return "select"
    return "text"
  }

  const required = (el) => {
    if (el.required || el.getAttribute("aria-required") === "true") return true
    const item = itemOf(el)
    if (!item) return false
    const label = item.querySelector('label, .el-form-item__label, .ant-form-item-label, [class*="label"]')
    if (label && /\\*/.test(textOf(label))) return true
    return !!item.querySelector('.is-required, [class*="required"]')
  }

  const controls = () => Array.from(document.querySelectorAll(controlSelector)).filter(visible)

  const findControl = (label) => {
    const needle = norm(label)
    if (!needle) return null
    const list = controls()
    const scored = list.map((el) => {
      const text = labelOf(el)
      const score = text === needle ? 3 : text.includes(needle) ? 2 : needle.includes(text) && text.length > 1 ? 1 : 0
      return { el, score }
    }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score)
    return scored.length > 0 ? scored[0].el : null
  }

  const buttonSelector = 'button, a, [role="button"], .el-button, .ant-btn, input[type="submit"], span, div'
  const allButtons = () =>
    Array.from(document.querySelectorAll(buttonSelector))
      .filter(visible)
      .filter((el) => !el.querySelector(buttonSelector))
      .map((el) => ({ el, text: norm(ownText(el) || textOf(el)) }))
      .filter((row) => row.text.length > 0 && row.text.length <= 40)

  const findButton = (label) => {
    const needle = norm(label)
    const rows = allButtons()
    const exact = rows.filter((row) => row.text === needle)
    if (exact.length > 0) {
      const clickable = exact.find((row) => row.el.closest('button, a, [role="button"], .el-button, .ant-btn')) || exact[0]
      return clickable.el.closest('button, a, [role="button"], .el-button, .ant-btn') || clickable.el
    }
    const loose = rows.filter((row) => row.text.includes(needle))
    if (loose.length > 0) return loose[0].el.closest('button, a, [role="button"], .el-button, .ant-btn') || loose[0].el
    return null
  }

  const clickButton = (labels) => {
    const list = Array.isArray(labels) ? labels : [labels]
    for (const label of list) {
      const el = findButton(label)
      if (el) {
        el.scrollIntoView({ block: "center" })
        el.click()
        return true
      }
    }
    return false
  }

  const setNativeValue = (el, value) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value")
    if (descriptor && descriptor.set) descriptor.set.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
  }

  const valueOf = (el) => {
    if (el.isContentEditable) return norm(el.innerText)
    if (el.value !== undefined) return norm(el.value)
    return norm(el.getAttribute("data-value") || "")
  }

  const openDropdown = (el) => {
    const trigger = el.closest('.el-select, .ant-select, [class*="select"]') || el
    trigger.click()
    const wrapper = trigger.querySelector('input, [role="combobox"]') || el
    wrapper.focus && wrapper.focus()
    return true
  }

  /** 当前可见的下拉弹层条目。 */
  const visibleOptions = () => {
    const selectors = [
      '.el-select-dropdown__item',
      '.ant-select-item-option',
      '[role="option"]',
      'li[role="option"]',
      '.el-dropdown-menu__item',
    ]
    const nodes = Array.from(document.querySelectorAll(selectors.join(","))).filter(visible)
    const mapped = nodes.map((el) => ({ el, text: norm(textOf(el)) })).filter((row) => row.text.length > 0)
    if (mapped.length > 0) return mapped
    return Array.from(document.querySelectorAll('li, [role="menuitem"], [class*="option"]'))
      .filter(visible)
      .map((el) => ({ el, text: norm(textOf(el)) }))
      .filter((row) => row.text.length > 0 && row.text.length <= 80 && !row.el.querySelector('input'))
  }

  const clickOption = (label) => {
    const needle = norm(label)
    const rows = visibleOptions()
    const exact = rows.find((row) => row.text === needle)
    const loose = exact || rows.find((row) => row.text.includes(needle) || needle.includes(row.text))
    if (!loose) return false
    loose.el.scrollIntoView({ block: "nearest" })
    loose.el.click()
    return true
  }

  const selectOption = (label, option) => {
    const el = findControl(label)
    if (!el) return false
    if (el.tagName === "SELECT") {
      const target = Array.from(el.options).find((item) => norm(item.text) === norm(option))
      if (!target) return false
      el.value = target.value
      el.dispatchEvent(new Event("change", { bubbles: true }))
      return true
    }
    openDropdown(el)
    return clickOption(option)
  }

  const optionTexts = (label) => {
    const el = label ? findControl(label) : null
    if (el && el.tagName === "SELECT") return Array.from(el.options).map((item) => norm(item.text))
    return visibleOptions().map((row) => row.text)
  }

  const currentValue = (label) => {
    const el = findControl(label)
    if (!el) return ""
    if (el.tagName === "SELECT") return norm(el.options[el.selectedIndex] && el.options[el.selectedIndex].text)
    return valueOf(el)
  }

  const dialogs = () =>
    Array.from(document.querySelectorAll('.el-dialog, .el-drawer, .ant-modal, [role="dialog"]'))
      .filter(visible)
      .map((el) => {
        const heading = el.querySelector('.el-dialog__title, .ant-modal-title, [class*="title"], h1, h2, h3')
        return norm(heading ? textOf(heading) : textOf(el).slice(0, 40))
      })

  const activeDialog = () => {
    const list = Array.from(document.querySelectorAll('.el-dialog, .el-drawer, .ant-modal, [role="dialog"]')).filter(visible)
    return list.length > 0 ? list[list.length - 1] : null
  }

  const probe = () => ({
    url: location.href,
    title: document.title,
    buttons: allButtons().map((row) => row.text).slice(0, 80),
    fields: controls().slice(0, 120).map((el) => ({
      label: labelOf(el),
      kind: kindOf(el),
      required: required(el),
      value: valueOf(el),
    })),
    dialogs: dialogs(),
  })

  globalThis.__itsm = {
    norm, visible, textOf, labelOf, kindOf, required, controls, findControl, findButton, clickButton,
    setNativeValue, valueOf, openDropdown, visibleOptions, clickOption, selectOption, optionTexts, currentValue,
    dialogs, activeDialog, probe,
  }
  return true
})()`

/** 页面里读一个字段的当前值。 */
export const readValue = (label: string) => `(() => globalThis.__itsm.currentValue(${JSON.stringify(label)}))()`

/** 页面里点一个按钮。 */
export const clickButton = (labels: readonly string[]) => `(() => globalThis.__itsm.clickButton(${JSON.stringify(labels)}))()`

/** 页面里找一个字段并聚焦。 */
export const focusField = (label: string) => `(() => { const el = globalThis.__itsm.findControl(${JSON.stringify(label)}); if (!el) return false; el.scrollIntoView({block:"center"}); el.focus && el.focus(); return true })()`

/** 页面里确认一个按钮存在。 */
export const hasButton = (labels: readonly string[]) =>
  `(() => { const list = ${JSON.stringify(labels)}; return list.some((label) => !!globalThis.__itsm.findButton(label)) })()`

/** 页面里确认某段文案可见。 */
export const hasText = (text: string) => `(() => document.body && document.body.innerText.includes(${JSON.stringify(text)}))()`

/** 页面里读所有可见按钮文案。 */
export const visibleButtons = `(() => globalThis.__itsm.probe().buttons)()`
