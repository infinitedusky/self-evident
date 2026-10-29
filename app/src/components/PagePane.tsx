/**
 * One page in a tab. The tab keeps its own history, like a browser tab: a link goes there in this tab, ⌘-click
 * (Ctrl-click) opens it in a tab of its own. The tab is told where it went, so its name, the address bar and the
 * agent follow.
 */
import { useEffect, useRef } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { PageRoutes } from '../routes'
import { useWorkspace } from '../workspace'

export function PagePane({ path, onNavigate, children }: { path: string; onNavigate?: (path: string) => void; children?: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Page onNavigate={onNavigate}>{children ?? <PageRoutes />}</Page>
    </MemoryRouter>
  )
}

function Page({ onNavigate, children }: { onNavigate?: (path: string) => void; children: React.ReactNode }) {
  const loc = useLocation()
  const navigate = useNavigate()
  const ws = useWorkspace()
  const first = useRef(true)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    scroller.current?.scrollTo({ top: 0 })
    onNavigate?.(loc.pathname + loc.search)
  }, [loc.pathname, loc.search]) // eslint-disable-line react-hooks/exhaustive-deps
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href')
    if (!a || !href?.startsWith('/') || a.target || href.startsWith('/api')) return
    if ((e.metaKey || e.ctrlKey) && ws) { e.preventDefault(); ws.open({ kind: 'page', path: href }); return }
    if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); navigate(href) } // a plain <a>: stay in the tab
  }
  return <div className="tab-page" ref={scroller} onClick={onClick} data-component="PagePane">{children}</div>
}
