/**
 * `.module.css` 的类名声明（由 scripts/gen-css-types.mjs 生成，不要手工改）
 *
 * 构建脚本用 lightningcss 把样式表编译成「局部名 → 哈希类名」的映射模块
 * 这里逐条列出类名：取值因此是 string 而不是 string | undefined
 * （本仓库开启 noUncheckedIndexedAccess），类名写错也会在编译期报出来
 */

declare module '*/menus.module.css' {
  const classes: {
    readonly "contextMenu": string
    readonly "menuArrow": string
    readonly "menuLabel": string
    readonly "menuLabelText": string
    readonly "menuList": string
  }
  export default classes
}

declare module '*/PinnedSection.module.css' {
  const classes: {
    readonly "pinArrow": string
    readonly "pinArrowOpen": string
    readonly "pinDivider": string
    readonly "pinExpand": string
    readonly "pinHead": string
    readonly "pinHeadHint": string
    readonly "pinHeadName": string
    readonly "pinHeadSlot": string
    readonly "pinHeadSpacer": string
    readonly "pinScroll": string
    readonly "pinScrollClipped": string
    readonly "pinScrollOpen": string
    readonly "pinnedSection": string
  }
  export default classes
}

declare module '*/SearchControl.module.css' {
  const classes: {
    readonly "search": string
    readonly "searchButton": string
    readonly "searchClear": string
    readonly "searchExpanded": string
    readonly "searchInput": string
    readonly "searchRail": string
    readonly "searchResult": string
    readonly "searchResultGroup": string
    readonly "searchResultHeading": string
    readonly "searchResultMeta": string
    readonly "searchResultPath": string
    readonly "searchResultSelected": string
    readonly "searchResultTitle": string
    readonly "searchResultWorkspace": string
    readonly "searchResults": string
    readonly "searchSlot": string
    readonly "searchSlotExpanded": string
    readonly "searchStatus": string
  }
  export default classes
}

declare module '*/ViewOptionsMenu.module.css' {
  const classes: {
    readonly "viewGroupLabel": string
    readonly "viewMenu": string
    readonly "viewOption": string
    readonly "viewOptionCheck": string
    readonly "viewOptionIcon": string
    readonly "viewOptionLabel": string
    readonly "viewOptionRow": string
    readonly "viewOptionSwitch": string
    readonly "viewSeparator": string
  }
  export default classes
}

declare module '*/WorkspaceGroupsRegion.module.css' {
  const classes: {
    readonly "list": string
    readonly "panel": string
    readonly "root": string
    readonly "tab": string
  }
  export default classes
}

declare module '*/WorkspacePickerMenu.module.css' {
  const classes: {
    readonly "pickerCaret": string
    readonly "pickerCaretOpen": string
    readonly "pickerCheck": string
    readonly "pickerIcon": string
    readonly "pickerLabel": string
    readonly "pickerMenu": string
    readonly "pickerReset": string
    readonly "pickerSection": string
    readonly "pickerSectionBody": string
    readonly "pickerSectionHead": string
    readonly "pickerSectionStatic": string
    readonly "pickerSectionTitle": string
  }
  export default classes
}

declare module '*/WorkspaceRail.module.css' {
  const classes: {
    readonly "rail": string
    readonly "railButton": string
  }
  export default classes
}

declare module '*/HoverCards.module.css' {
  const classes: {
    readonly "hoverContent": string
    readonly "hoverPath": string
    readonly "hoverStatus": string
    readonly "hoverTime": string
    readonly "hoverTitle": string
  }
  export default classes
}

declare module '*/dialogs.module.css' {
  const classes: {
    readonly "dangerAction": string
    readonly "dialogCheck": string
    readonly "dialogError": string
    readonly "dialogList": string
  }
  export default classes
}

declare module '*/rows.module.css' {
  const classes: {
    readonly "arrow": string
    readonly "arrowOpen": string
    readonly "chevron": string
    readonly "empty": string
    readonly "expand": string
    readonly "expandClip": string
    readonly "expandOpen": string
    readonly "flatList": string
    readonly "folder": string
    readonly "folderActive": string
    readonly "group": string
    readonly "groupBody": string
    readonly "groupCount": string
    readonly "groupHead": string
    readonly "groupLabel": string
    readonly "indicator": string
    readonly "indicatorBar": string
    readonly "nest": string
    readonly "note": string
    readonly "noteNested": string
    readonly "pickerRow": string
    readonly "row": string
    readonly "rowAction": string
    readonly "rowActionDanger": string
    readonly "rowActionSlot": string
    readonly "rowActions": string
    readonly "rowPin": string
    readonly "rowPinOff": string
    readonly "rowPinOn": string
    readonly "rowSelected": string
    readonly "rowTime": string
    readonly "rowTitle": string
    readonly "sessions": string
    readonly "slot": string
    readonly "virtualWorkspace": string
    readonly "virtualWorkspaceBody": string
    readonly "virtualWorkspaceHead": string
    readonly "virtualWorkspaceLabel": string
    readonly "workspace": string
    readonly "workspaceBody": string
    readonly "workspaceHead": string
    readonly "workspaceTitle": string
  }
  export default classes
}

declare module '*/header.module.css' {
  const classes: {
    readonly "header": string
    readonly "headerAction": string
    readonly "headerActions": string
    readonly "headerActionsHidden": string
    readonly "headerCaret": string
    readonly "headerCaretOpen": string
    readonly "headerFocus": string
    readonly "headerHeading": string
    readonly "headerLabel": string
    readonly "headerRail": string
    readonly "headerTitle": string
    readonly "headerTitleHidden": string
    readonly "headerTitled": string
  }
  export default classes
}
