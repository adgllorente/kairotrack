import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select-native';
import {
  useHeatmap,
  useProjects,
  useStatsSummary,
  useTracks,
  type SummaryRow,
  type ProjectSummaryRow,
} from '@/hooks/data';
import type { Project, Track } from '@/lib/api';
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
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Time spent overview.</p>
      </div>

      <Heatmap projectId={projectId} />

      <WeeklyByProjectChart />

      <div className="border-t pt-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Overview</h2>
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

      </div>
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

type WeekSegment = {
  dayIdx: number;
  startMin: number;
  endMin: number;
  project: Project;
  note: string;
};

const PX_PER_HOUR = 36;
const FALLBACK_HOUR_START = 8;
const FALLBACK_HOUR_END = 18;

function WeeklyByProjectChart() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(
    () => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7),
    [weekOffset],
  );
  const from = Math.floor(weekStart.getTime() / 1000);
  const to = Math.floor(addDays(weekStart, 7).getTime() / 1000);
  const tracks = useTracks({ from, to, limit: 5000 });
  const projects = useProjects();

  const { days, hourStart, hourEnd, segmentsByDay, usedProjects, dailyTotals, weekTotal } = useMemo(() => {
    const dayList = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { date: d, label: format(d, 'EEE d') };
    });
    const pmap = new Map<number, Project>();
    (projects.data || []).forEach((p) => pmap.set(p.id, p));

    const nowSec = Math.floor(Date.now() / 1000);
    const weekStartSec = Math.floor(weekStart.getTime() / 1000);
    const segs: WeekSegment[] = [];

    ((tracks.data as Track[] | undefined) || []).forEach((t) => {
      const start = t.started_at;
      const end = t.ended_at ?? nowSec;
      if (end <= start) return;
      const project = pmap.get(t.project_id) || {
        id: t.project_id,
        name: `#${t.project_id}`,
        color: '#6366f1',
        archived_at: null,
        created_at: 0,
      };
      let cur = start;
      while (cur < end) {
        const dayIdx = Math.floor((cur - weekStartSec) / 86400);
        if (dayIdx < 0 || dayIdx >= 7) break;
        const dayStartSec = weekStartSec + dayIdx * 86400;
        const dayEndSec = dayStartSec + 86400;
        const segEnd = Math.min(end, dayEndSec);
        segs.push({
          dayIdx,
          startMin: (cur - dayStartSec) / 60,
          endMin: (segEnd - dayStartSec) / 60,
          project,
          note: t.note,
        });
        cur = segEnd;
      }
    });

    let hStart = FALLBACK_HOUR_START;
    let hEnd = FALLBACK_HOUR_END;
    if (segs.length > 0) {
      let minMin = Infinity;
      let maxMin = -Infinity;
      segs.forEach((s) => {
        if (s.startMin < minMin) minMin = s.startMin;
        if (s.endMin > maxMin) maxMin = s.endMin;
      });
      hStart = Math.max(0, Math.floor(minMin / 60) - 1);
      hEnd = Math.min(24, Math.ceil(maxMin / 60) + 1);
      if (hEnd <= hStart) hEnd = Math.min(24, hStart + 1);
    }

    const byDay: WeekSegment[][] = Array.from({ length: 7 }, () => []);
    const totals: number[] = Array.from({ length: 7 }, () => 0);
    segs.forEach((s) => {
      byDay[s.dayIdx].push(s);
      totals[s.dayIdx] += s.endMin - s.startMin;
    });

    const usedIds = new Set<number>();
    segs.forEach((s) => usedIds.add(s.project.id));
    const used = Array.from(usedIds)
      .map((id) => pmap.get(id))
      .filter((p): p is Project => Boolean(p))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      days: dayList,
      hourStart: hStart,
      hourEnd: hEnd,
      segmentsByDay: byDay,
      usedProjects: used,
      dailyTotals: totals,
      weekTotal: totals.reduce((a, b) => a + b, 0),
    };
  }, [tracks.data, projects.data, weekStart]);

  const hourCount = hourEnd - hourStart;
  const gridHeight = hourCount * PX_PER_HOUR;
  const hourTicks = Array.from({ length: hourCount + 1 }, (_, i) => hourStart + i);
  const dayMs = Date.now() - weekStart.getTime();
  const todayIdx = dayMs >= 0 && dayMs < 7 * 86_400_000 ? Math.floor(dayMs / 86_400_000) : -1;
  const weekEnd = addDays(weekStart, 6);
  const rangeLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${format(weekStart, 'd')} – ${format(weekEnd, 'd MMM yyyy')}`
      : `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`;
  let weekHeading: string;
  if (weekOffset === 0) weekHeading = 'This week';
  else if (weekOffset === -1) weekHeading = 'Last week';
  else weekHeading = rangeLabel;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="flex items-baseline gap-2">
          <span>{weekHeading} by project</span>
          {weekHeading !== rangeLabel && (
            <span className="text-xs font-normal text-muted-foreground">{rangeLabel}</span>
          )}
          <span className="text-xs font-normal text-muted-foreground">
            · {formatMinutesShort(weekTotal)} total
          </span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset((o) => o - 1)}
            aria-label="Previous week"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset((o) => o + 1)}
            aria-label="Next week"
            disabled={weekOffset >= 0}
          >
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[3rem_1fr] gap-x-2 text-xs">
          <div />
          <div className="row-span-2 overflow-x-auto sm:overflow-visible">
            <div className="grid w-max sm:w-auto grid-cols-[repeat(7,calc((100vw_-_7.5rem)/3))] sm:grid-cols-7 gap-px text-center pb-1">
              {days.map((d, i) => (
                <div
                  key={i}
                  className={`flex flex-col leading-tight ${i === todayIdx ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  <span className="font-medium">{d.label}</span>
                  <span
                    className={`text-[10px] tabular-nums ${dailyTotals[i] > 0 ? '' : 'opacity-40'}`}
                  >
                    {formatMinutesShort(dailyTotals[i])}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="relative grid w-max sm:w-auto grid-cols-[repeat(7,calc((100vw_-_7.5rem)/3))] sm:grid-cols-7 gap-px rounded-md border border-border bg-border overflow-hidden"
              style={{ height: gridHeight }}
            >
              {days.map((_, i) => (
                <div
                  key={i}
                  className={`relative ${i === todayIdx ? 'bg-muted/40' : 'bg-background'}`}
                >
                  {hourTicks.slice(1, -1).map((_, hi) => (
                    <div
                      key={hi}
                      className="absolute inset-x-0 border-t border-border/50"
                      style={{ top: (hi + 1) * PX_PER_HOUR }}
                    />
                  ))}
                  {segmentsByDay[i].map((s, si) => {
                    const top = ((s.startMin / 60) - hourStart) * PX_PER_HOUR;
                    const height = Math.max(2, ((s.endMin - s.startMin) / 60) * PX_PER_HOUR);
                    return (
                      <div
                        key={si}
                        className="absolute inset-x-0.5 rounded-sm px-1 overflow-hidden text-[10px] leading-tight text-white shadow-sm"
                        style={{
                          top,
                          height,
                          backgroundColor: s.project.color,
                        }}
                        title={`${s.project.name}${s.note ? ` — ${s.note}` : ''}\n${formatMinHM(s.startMin)} – ${formatMinHM(s.endMin)} (${formatDurationHM(s.endMin - s.startMin)})`}
                      >
                        {height > 16 && <div className="font-medium truncate">{s.project.name}</div>}
                        {height > 30 && (
                          <div className="opacity-80 tabular-nums">
                            {formatMinHM(s.startMin)}–{formatMinHM(s.endMin)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="relative text-muted-foreground tabular-nums" style={{ height: gridHeight }}>
            {hourTicks.map((h, i) => (
              <div
                key={h}
                className="absolute right-0 -translate-y-1/2 pr-1"
                style={{ top: i * PX_PER_HOUR }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>
        {usedProjects.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {usedProjects.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block size-3 rounded-sm"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatMinutesShort(m: number): string {
  if (m <= 0) return '0h';
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}

function formatDurationHM(m: number): string {
  const total = Math.max(0, Math.round(m));
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatMinHM(m: number): string {
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
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
