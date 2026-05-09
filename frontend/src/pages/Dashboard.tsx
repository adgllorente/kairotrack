import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  addDays,
  format,
  getDay,
} from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select-native';
import {
  useHeatmap,
  useProjects,
  useStatsSummary,
  type SummaryRow,
  type ProjectSummaryRow,
} from '@/hooks/data';
import { formatHours } from '@/lib/utils';

type Range = '7d' | '30d' | 'week' | 'month' | 'year' | 'all';

const RANGES: { value: Range; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

function rangeBounds(range: Range): {
  from?: number;
  to?: number;
  groupBy: 'day' | 'week' | 'month';
} {
  const now = new Date();
  if (range === '7d') return { from: Math.floor(subDays(now, 7).getTime() / 1000), groupBy: 'day' };
  if (range === '30d')
    return { from: Math.floor(subDays(now, 30).getTime() / 1000), groupBy: 'day' };
  if (range === 'week')
    return {
      from: Math.floor(startOfWeek(now, { weekStartsOn: 1 }).getTime() / 1000),
      groupBy: 'day',
    };
  if (range === 'month')
    return { from: Math.floor(startOfMonth(now).getTime() / 1000), groupBy: 'day' };
  if (range === 'year')
    return { from: Math.floor(startOfYear(now).getTime() / 1000), groupBy: 'month' };
  return { groupBy: 'month' };
}

export function DashboardPage() {
  const [range, setRange] = useState<Range>('7d');
  const [projectId, setProjectId] = useState<number | undefined>();
  const projects = useProjects();
  const bounds = rangeBounds(range);

  const summary = useStatsSummary({
    group_by: bounds.groupBy,
    from: bounds.from,
    project_id: projectId,
  });
  const byProject = useStatsSummary({
    group_by: 'project',
    from: bounds.from,
  });
  const summaryRows = useMemo(
    () => (summary.data as SummaryRow[] | undefined) || [],
    [summary.data],
  );
  const projectRows = useMemo(
    () => (byProject.data as ProjectSummaryRow[] | undefined) || [],
    [byProject.data],
  );

  const totalSeconds = useMemo(
    () => summaryRows.reduce((acc, r) => acc + r.seconds, 0),
    [summaryRows],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Time spent overview.</p>
        </div>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <Label>Range</Label>
            <NativeSelect value={range} onChange={(e) => setRange(e.target.value as Range)}>
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label>Project</Label>
            <NativeSelect
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard title="Total" value={formatHours(totalSeconds)} />
        <StatCard title="Entries" value={String(summaryRows.reduce((a, r) => a + r.count, 0))} />
        <StatCard title="Per week (avg)" value={formatPerWeek(totalSeconds, bounds.from)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Time by {bounds.groupBy}</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summaryRows.map((r) => ({ ...r, hours: r.seconds / 3600 }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="bucket"
                stroke="currentColor"
                className="text-xs text-muted-foreground"
              />
              <YAxis stroke="currentColor" className="text-xs text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                }}
                formatter={(v: number) => [`${v.toFixed(2)}h`, 'Hours']}
              />
              <Bar dataKey="hours" fill="#6366f1" radius={[4, 4, 0, 0]} />
              {summaryRows.length > 0 && (
                <ReferenceLine
                  y={totalSeconds / 3600 / summaryRows.length}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: `avg ${(totalSeconds / 3600 / summaryRows.length).toFixed(2)}h`,
                    position: 'insideTopRight',
                    fill: '#ef4444',
                    fontSize: 11,
                  }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>By project</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={projectRows}
                  dataKey="seconds"
                  nameKey="project_name"
                  outerRadius={90}
                  innerRadius={50}
                >
                  {projectRows.map((entry, i) => (
                    <Cell key={i} fill={entry.project_color || '#6366f1'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                  }}
                  formatter={(v: number) => [`${(v / 3600).toFixed(2)}h`, 'Hours']}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summaryRows.map((r) => ({ ...r, hours: r.seconds / 3600 }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="bucket"
                  stroke="currentColor"
                  className="text-xs text-muted-foreground"
                />
                <YAxis stroke="currentColor" className="text-xs text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                  }}
                  formatter={(v: number) => [`${v.toFixed(2)}h`, 'Hours']}
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Heatmap projectId={projectId} />
    </div>
  );
}

function formatPerWeek(totalSeconds: number, fromSec?: number): string {
  if (fromSec === undefined) return '—';
  const nowSec = Math.floor(Date.now() / 1000);
  const weeks = (nowSec - fromSec) / (7 * 24 * 3600);
  if (weeks < 1 / 7) return '—';
  const hoursPerWeek = totalSeconds / 3600 / weeks;
  return `${hoursPerWeek.toFixed(1)}h`;
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function Heatmap({ projectId }: { projectId?: number }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const data = useHeatmap(year, projectId);

  const map = useMemo(() => {
    const m = new Map<string, number>();
    (data.data || []).forEach((r) => m.set(r.day, r.seconds));
    return m;
  }, [data.data]);

  const max = useMemo(() => Math.max(1, ...(data.data || []).map((r) => r.seconds)), [data.data]);

  const cells = useMemo(() => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const startWeekday = getDay(start);
    const result: { date: Date | null; seconds: number }[] = [];
    for (let i = 0; i < startWeekday; i++) result.push({ date: null, seconds: 0 });
    let cur = start;
    while (cur <= end) {
      const key = format(cur, 'yyyy-MM-dd');
      result.push({ date: new Date(cur), seconds: map.get(key) || 0 });
      cur = addDays(cur, 1);
    }
    return result;
  }, [year, map]);

  function intensity(s: number) {
    if (s <= 0) return 0;
    const r = s / max;
    if (r < 0.25) return 1;
    if (r < 0.5) return 2;
    if (r < 0.75) return 3;
    return 4;
  }

  const colors = [
    'bg-muted',
    'bg-indigo-200 dark:bg-indigo-950',
    'bg-indigo-300 dark:bg-indigo-800',
    'bg-indigo-400 dark:bg-indigo-600',
    'bg-indigo-500 dark:bg-indigo-400',
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Activity</CardTitle>
        <NativeSelect
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-auto"
        >
          {[year - 2, year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </NativeSelect>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div
            className="grid grid-flow-col gap-1"
            style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
          >
            {cells.map((c, i) => (
              <div
                key={i}
                title={
                  c.date ? `${format(c.date, 'yyyy-MM-dd')}: ${(c.seconds / 3600).toFixed(2)}h` : ''
                }
                className={`size-3 rounded-sm ${c.date ? colors[intensity(c.seconds)] : 'opacity-0'}`}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          Less
          {colors.map((c, i) => (
            <div key={i} className={`size-3 rounded-sm ${c}`} />
          ))}
          More
        </div>
      </CardContent>
    </Card>
  );
}
