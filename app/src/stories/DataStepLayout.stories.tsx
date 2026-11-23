import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Badge } from '../components/Badge'

// The mockup the Data step was rebuilt to (docs/reviewable-prs-brief.md, step 1): Fixtures, TaskCalls and EndpointData
// now use these levels. Nothing here works: it shows the levels of the page and the one text style each has. Everything is made up (an invented vendor
// and company). The fixture buttons (make one from the seed, open, rename, delete) are step 3's proposal, drawn so
// their place can be judged.
const Btn = ({ children }: { children: string }) => <button className="btn quiet small" type="button">{children}</button>
const Call = ({ method, path, says, needs, data, sub, step, tools = true }: { method: string; path: string; says: string; needs?: string; data: React.ReactNode; sub?: string; step?: boolean; tools?: boolean }) => (
  <div className="lv-row" data-step={step ? 'yes' : undefined}>
    <div>
      <span className="mock-method">{method}</span> <code>{path}</code>
      <div className="lv-sub">{says}</div>
      {needs && <div className="lv-sub">This task needs: {needs}</div>}
    </div>
    <div>{data}{sub && <div className="lv-sub">{sub}</div>}</div>
    <span className="lv-tools">{tools && <><Btn>Edit</Btn><Btn>×</Btn></>}</span>
  </div>
)

function Mockup() {
  return (
    <div style={{ maxWidth: 760 }}>
      <p className="faint" style={{ fontSize: 13, margin: '0 0 12px' }}>Mockup, made-up sample data. Levels: the page (Data) › a section (Fixtures, Services) › an item (a fixture, a service) › a part (Info, Source, Endpoints) › a row.</p>
      <section className="panel">
        <h2>Data</h2>

        <div className="lv-section" data-level="section">
          <div className="lv-section-head"><h3>Fixtures<span className="lv-count">2</span></h3><Btn>Make one from the app's seed</Btn></div>
          <p className="lv-section-note">What is in the app's own database when it is tried. Made-up rows, with ids that stay the same.</p>
          <details className="lv-item" data-level="item" open>
            <summary className="lv-item-head"><span className="lv-item-name">northwind-company (sample)</span><Badge tone="accent">This task's</Badge><span className="lv-item-meta lv-end">264 rows in 3 tables · 1.4 MB</span></summary>
            <div className="lv-part" data-level="part">
              <div className="lv-part-head"><span className="lv-part-label">Tables</span><Btn>Rename</Btn><Btn>Delete</Btn></div>
              <div className="lv-row" data-level="row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}><div><code>employees</code><div className="lv-sub">id, first_name, last_name, work_email, department_id and 9 more</div></div><span className="lv-item-meta">250 rows</span></div>
              <div className="lv-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}><div><code>departments</code><div className="lv-sub">id, name, company_id</div></div><span className="lv-item-meta">13 rows</span></div>
              <div className="lv-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}><div><code>companies</code><div className="lv-sub">id, name, domain</div></div><span className="lv-item-meta">1 row</span></div>
            </div>
          </details>
          <details className="lv-item">
            <summary className="lv-item-head"><span className="lv-item-name">three-people (sample)</span><span className="lv-item-meta lv-end">3 rows in 1 table · 4 KB</span></summary>
          </details>
        </div>

        <div className="lv-section" data-level="section">
          <div className="lv-section-head"><h3>Services<span className="lv-count">2, with 4 calls</span></h3><Btn>Add a service</Btn></div>
          <p className="lv-section-note">What this task calls outside the app. Each is mocked, so the task can be tried without calling it.</p>
          <details className="lv-item">
            <summary className="lv-item-head"><span className="lv-item-name">What the task needs</span><span className="lv-item-meta lv-end">The agent's report · 22 Nov</span></summary>
            <div className="lv-part"><div className="md-text"><p>One service (sample), three calls in order: start a run, poll its status, fetch the results file by the link the service sends.</p></div></div>
          </details>

          <div className="lv-item" data-level="item">
            <div className="lv-item-head"><span className="lv-item-name">Fraud scan vendor (sample)</span><span className="lv-end"><Badge tone="ok" dot>Served from its endpoints</Badge><Btn>×</Btn></span></div>
            <div className="lv-part" data-level="part">
              <div className="lv-part-head"><span className="lv-part-label">Info</span><span className="lv-sub" style={{ margin: 0 }}>Changed in Settings › Mocks</span></div>
              <dl className="lv-fields">
                <dt>What it is</dt><dd>Fraud scan vendor workflow 0a1b2c, results CSV (sample)</dd>
                <dt>Real address</dt><dd><code>https://api.fraud-scan.example</code></dd>
                <dt>Variable to override</dt><dd><code>FRAUD_SCAN_BASE_URL</code></dd>
              </dl>
            </div>
            <div className="lv-part">
              <div className="lv-part-head"><span className="lv-part-label">Source</span></div>
              <div className="lv-cols">
                <div><strong>Prototype</strong>The mock, with faked data<div className="lv-sub">The app's default · <a href="#">Override</a></div></div>
                <div><strong>Smoke test</strong>The real service <Badge tone="warn">Real · this computer only</Badge><div className="lv-sub">This task's own · every run is a real call</div></div>
                <div><strong>Reviewer</strong>The mock, with faked data<div className="lv-sub">Always: a reviewer is never given anything real</div></div>
              </div>
            </div>
            <div className="lv-part">
              <div className="lv-part-head"><span className="lv-part-label">Endpoints<span className="lv-count">3 of its 4</span></span><Btn>Add a call</Btn></div>
              <Call method="POST" path="/workflows/run" says="A job id for the people sent" data={<span className="faint">No data yet: a call to it fails</span>} sub="Add data" />
              <Call method="GET" path="/workflows/runs/{id}/status" says="Running, then completed" needs="also a run that failed" data={<><Badge tone="ok">Faked</Badge> status.json</>} sub="From the app's settings · Override" />
              <Call step method="GET" path="the link in download_url" says="One row for each person sent, with what was found" data={<><Badge tone="ok">Faked</Badge> results.csv <Badge tone="accent">This task's own</Badge></>} sub="For 25 people of northwind-company (sample) · Change" tools={false} />
            </div>
          </div>

          <div className="lv-item">
            <div className="lv-item-head"><span className="lv-item-name">Address lookup (sample)</span><span className="lv-end"><Badge tone="warn" dot>No data yet</Badge><Btn>×</Btn></span></div>
            <div className="lv-part">
              <div className="lv-part-head"><span className="lv-part-label">Info</span><span className="lv-sub" style={{ margin: 0 }}>Changed in Settings › Mocks</span></div>
              <dl className="lv-fields">
                <dt>What it is</dt><dd>Address lookup v1 (sample)</dd>
                <dt>Real address</dt><dd><code>https://api.address-lookup.example</code></dd>
                <dt>Variable to override</dt><dd><code>ADDRESS_LOOKUP_URL</code></dd>
              </dl>
            </div>
            <div className="lv-part">
              <div className="lv-part-head"><span className="lv-part-label">Source</span></div>
              <div className="lv-cols">
                <div><strong>Prototype</strong>The mock, with no data yet<div className="lv-sub">The app's default · <a href="#">Override</a></div></div>
                <div><strong>Smoke test</strong>The mock, with no data yet<div className="lv-sub">The app's default · <a href="#">Override</a></div></div>
                <div><strong>Reviewer</strong>The mock, with no data yet<div className="lv-sub">Always: a reviewer is never given anything real</div></div>
              </div>
            </div>
            <div className="lv-part">
              <div className="lv-part-head"><span className="lv-part-label">Endpoints<span className="lv-count">1 of its 1</span></span><Btn>Add a call</Btn></div>
              <Call method="GET" path="/v1/lookup" says="The address a finding points at" data={<span className="faint">No data yet: a call to it fails</span>} sub="Add data" />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

const meta = { title: 'Mockups/Data step layout', component: Mockup } satisfies Meta<typeof Mockup>
export default meta
type Story = StoryObj<typeof meta>

/** The Data step's hierarchy as one page: sections ruled off and headed, a fixture and a service as the same kind of block, parts as quiet labels, rows under them. A fixture opens to its tables. */
export const TheLevels: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('heading', { name: /^Fixtures/ })).toBeInTheDocument()
    await expect(c.getByRole('heading', { name: /^Services/ })).toBeInTheDocument()
    // One style a level: every section heading, item name and part label is set the same as its peers.
    const same = (sel: string) => new Set([...canvasElement.querySelectorAll(sel)].map((e) => { const s = getComputedStyle(e); return `${s.fontSize}/${s.fontWeight}/${s.color}` })).size
    for (const sel of ['.lv-section-head h3', '.lv-item-name', '.lv-part-label']) await expect(same(sel)).toBe(1)
  },
}
