/**
 * 搜索：header 里的入口与输入框，以及结果列表
 *
 * 几何与动效照官方 `ui-workspace` 的搜索：收起时是一个 28px 正圆图标按钮，展开后该槽位拉满宽度、按钮与图标一起缩小
 * 标题与右侧两个入口同时淡出移开，清除按钮只在展开时出现
 *
 * 与官方一致的还有两处与外壳联动的行为：窄栏点搜索会先展开侧栏、等列滑动跑完再聚焦（`focus()` 会强制一次同步布局，立刻聚焦会把整段滑动卡住）
 * 点击别处只收回焦点，查询词非空时保持展开
 *
 * 本包只做官方的本地标题匹配那一段，不接 Host 内容检索，因此结果行没有摘录，也没有加载与失败两态
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactElement, RefObject } from 'react'
import { IconCloseFillRegular, IconSearchOutlineRegular, StateDot, Tooltip } from '../runtime.ts'
import { sanitizeSearchQuery, SEARCH_QUERY_MAX_CODE_UNITS } from '../data/search.ts'
import type { SearchMatch, SessionSearchResult } from '../data/search.ts'
import type { SessionStatus } from '../data/status.ts'
import { useLocale } from '../useLocale.ts'
import searchStyles from './SearchControl.module.css'
import regionStyles from './WorkspaceGroupsRegion.module.css'
import rowsStyles from './components/rows.module.css'
import clsx from 'clsx'

/**
 * 侧栏列滑动的时长（官方 `--ds-transition-duration-slow`）
 *
 * 窄栏点搜索后要等它跑完再聚焦：`focus()` 强制同步布局，抢在滑动中间会把整段动画卡住
 */
const EXPAND_SLIDE_MS = 300

/** 搜索的状态面：由区域组件持有，header 与结果列表分别消费 */
export interface SearchState {
  /** 受控输入值，已收进查询契约 */
  query: string
  /** 去掉首尾空白的查询词，为空表示不在搜索态 */
  normalized: string
  /** 输入框是否展开 */
  expanded: boolean
  setQuery: (value: string) => void
  /** 宽栏点入口：展开输入框 */
  expand: () => void
  /** 窄栏点入口：展开侧栏，等滑动跑完再聚焦 */
  expandFromRail: () => void
  /** 清除按钮：清空查询并收起 */
  clear: () => void
  /** 供聚焦使用，由区域组件持有，与 wide 的联动写在下面的 effect 里 */
  inputRef: RefObject<HTMLInputElement>
  /** 输入框所在的外层容器，用于判断点击是否落在搜索内部 */
  rootRef: RefObject<HTMLDivElement>
}

/**
 * 搜索的状态与副作用
 *
 * 状态留在区域组件这一层而不是 header 内部：窄栏入口要触发宽栏输入框的聚焦，这一跨形态的联动需要一个共同宿主
 * @returns 搜索状态面
 */
export function useSearch(wide: boolean, expandSidebar: () => void): SearchState {
  const [query, setQueryValue] = useState('')
  const [expanded, setExpanded] = useState(false)
  // 窄栏点了搜索：等侧栏展开动作跑完再聚焦，见 EXPAND_SLIDE_MS
  const [focusAfterSlide, setFocusAfterSlide] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const normalized = sanitizeSearchQuery(query).trim()

  useEffect(() => {
    if (!wide || !focusAfterSlide) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true })
      setFocusAfterSlide(false)
    }, EXPAND_SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [wide, focusAfterSlide])

  useEffect(() => {
    if (!wide || !expanded || focusAfterSlide) return
    inputRef.current?.focus({ preventScroll: true })
  }, [wide, expanded, focusAfterSlide])

  // 点击搜索之外：先收回焦点，查询为空时顺带把输入框收起，header 回到常规形态
  useEffect(() => {
    if (!wide || !expanded || focusAfterSlide) return
    const onClick = (event: MouseEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return
      inputRef.current?.blur()
      if (normalized !== '') return
      setExpanded(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [normalized, wide, expanded, focusAfterSlide])

  return {
    query: sanitizeSearchQuery(query),
    normalized,
    expanded,
    setQuery: (value: string) => setQueryValue(sanitizeSearchQuery(value)),
    expand: () => setExpanded(true),
    expandFromRail: () => {
      setExpanded(true)
      setFocusAfterSlide(true)
      expandSidebar()
    },
    clear: () => {
      setQueryValue('')
      setExpanded(false)
    },
    inputRef,
    rootRef,
  }
}

/** 宽栏 header 里的搜索槽位，入口与输入框的文案取自 `useLocale()` */
export interface SearchEntryProps {
  search: SearchState
}

export function SearchEntry({ search }: SearchEntryProps): ReactElement {
  const { labels: region } = useLocale()
  const labels = region.search
  const { expanded, query, inputRef, rootRef } = search
  return (
    <div className={clsx(searchStyles.searchSlot, expanded && searchStyles.searchSlotExpanded)}>
      <div
        ref={rootRef}
        className={clsx(searchStyles.search, expanded && searchStyles.searchExpanded)}
        onClick={() => {
          search.expand()
          inputRef.current?.focus()
        }}
      >
        <Tooltip label={labels.hint} side="bottom" delayMs={500} disabled={expanded}>
          <button
            type="button"
            className={searchStyles.searchButton}
            aria-label={labels.entry}
            aria-expanded={expanded}
            onClick={() => search.expand()}
          >
            <IconSearchOutlineRegular size={expanded ? 11 : 14} />
          </button>
        </Tooltip>
        <input
          ref={inputRef}
          className={searchStyles.searchInput}
          type="text"
          placeholder={labels.placeholder}
          maxLength={SEARCH_QUERY_MAX_CODE_UNITS}
          value={query}
          tabIndex={expanded ? 0 : -1}
          onChange={(event) => search.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            search.clear()
          }}
        />
        {expanded ? (
          <button
            type="button"
            className={searchStyles.searchClear}
            aria-label={labels.clear}
            onClick={(event) => {
              event.stopPropagation()
              search.clear()
            }}
          >
            <IconCloseFillRegular />
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** 窄栏里的搜索入口：展开侧栏后再聚焦宽栏的输入框 */
export function SearchRailEntry({ search }: SearchEntryProps): ReactElement {
  const { labels: region } = useLocale()
  const labels = region.search
  return (
    <div className={clsx(searchStyles.search, searchStyles.searchRail)}>
      <Tooltip label={labels.hint}>
        <button
          type="button"
          className={searchStyles.searchButton}
          aria-label={labels.entry}
          onClick={() => search.expandFromRail()}
        >
          <IconSearchOutlineRegular size={18} />
        </button>
      </Tooltip>
    </div>
  )
}

/** 结果列表的 props */
export interface SearchResultsProps {
  /** 本次命中的结果页 */
  result: SessionSearchResult
  /** 结果条数上限，被截断时的提示要带上它 */
  limit: number
  /** 当前打开的会话 id，用于结果行的选中态 */
  currentSessionId?: string | undefined
  /** 结果行的状态位推导，与常规会话行同一份实现 */
  statusOf: (match: SearchMatch) => SessionStatus | undefined
  /** 打开一条结果所在的会话 */
  onOpen: (match: SearchMatch) => void
}

/**
 * 一条结果的路径构成
 *
 * 分成两段是为了给出色阶对比：工作区名用更强的色阶，分组名用更弱的那一档，一眼能看出哪一段是容器、哪一段是组
 */
export interface ResultPath {
  /** 工作区名，用更强的一档色阶 */
  workspace?: string
  /** 分组名，用更弱的一档色阶。未归组时缺省 */
  group?: string
  /** 没有工作区归属时的回退名（官方 `group.ungrouped`），单独成一档 */
  ungrouped?: string
}

/**
 * 拆出一条结果的路径
 *
 * 有工作区时是 `工作区/分组`，未归组只留工作区，没有工作区归属则退回官方的「未分组」
 * @returns 路径各段
 */
export function resultPath(match: SearchMatch, ungrouped: string): ResultPath {
  if (match.workspace === undefined) return { ungrouped }
  if (match.group === undefined) return { workspace: match.workspace.title }
  return { workspace: match.workspace.title, group: match.group.name }
}

/**
 * 搜索结果体
 *
 * 结构与官方同一套：外层是列表的滚动容器，里面一个 `role="tree"` 的结果区，之后依次是空态与被截断的提示
 * 官方在结果下方还要渲染搜索中与不可用两态，本包不接内容检索，那两态不存在
 */
export function SearchResults({
  result,
  limit,
  currentSessionId,
  statusOf,
  onOpen,
}: SearchResultsProps): ReactElement {
  const { labels } = useLocale()
  const search = labels.search
  return (
    // panel 让整块结果面板淡入，与常规列表来回切换时各有一段淡入（官方三种内容体共用的 .treeBody 也是这么挂的）
    <div className={clsx(regionStyles.list, regionStyles.panel)}>
      <div className={searchStyles.searchResults} role="tree" aria-label={search.results}>
        {result.matches.map((match) => {
          const selected = match.row.id === currentSessionId
          const status = statusOf(match)
          const path = resultPath(match, labels.ungrouped)
          return (
            <button
              key={match.row.id}
              type="button"
              className={clsx(searchStyles.searchResult, selected && searchStyles.searchResultSelected)}
              role="treeitem"
              aria-selected={selected}
              onClick={() => onOpen(match)}
            >
              <span className={searchStyles.searchResultHeading}>
                {/* 状态位与常规会话行同一套：空闲时留空占位，标题的左缘因此
                    与列表里的行对齐 */}
                {status === undefined ? (
                  <span className={rowsStyles.slot} />
                ) : (
                  <span className={rowsStyles.slot} role="img" aria-label={status.label}>
                    <StateDot state={status.state} />
                  </span>
                )}
                <span className={searchStyles.searchResultTitle}>{match.row.title}</span>
              </span>
              {/* 路径是一个整体：两段着色包在同一个元素里，靠外层那格 gap 隔开的是
                  「路径」与（本包没有的）摘录，绝不会落到这两段之间 */}
              <span className={searchStyles.searchResultMeta}>
                <span className={searchStyles.searchResultPath}>
                  {path.ungrouped === undefined ? null : (
                    <span className={searchStyles.searchResultWorkspace}>{path.ungrouped}</span>
                  )}
                  {path.workspace === undefined ? null : (
                    <span className={searchStyles.searchResultWorkspace}>{path.workspace}</span>
                  )}
                  {path.group === undefined ? null : (
                    <span className={searchStyles.searchResultGroup}>{`/${path.group}`}</span>
                  )}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {result.matches.length === 0 ? (
        <div className={rowsStyles.empty}>{search.noMatches}</div>
      ) : null}
      {result.hasMore ? (
        <div className={searchStyles.searchStatus}>{search.truncated(limit)}</div>
      ) : null}
    </div>
  )
}
