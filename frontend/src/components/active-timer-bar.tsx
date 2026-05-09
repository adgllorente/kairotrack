import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Square, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActiveTrack, useProjects, useStopTrack, useTasks } from '@/hooks/data';
import { formatDuration } from '@/lib/utils';
import { toast } from 'sonner';

export function ActiveTimerBar() {
  const active = useActiveTrack();
  const projects = useProjects(true);
  const tasks = useTasks(active.data?.project_id, true);
  const stop = useStopTrack();

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const activeId = active.data?.id;
  useEffect(() => {
    if (!activeId) return;
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, [activeId]);

  if (!active.data) return null;

  const project = projects.data?.find((p) => p.id === active.data!.project_id);
  const task = tasks.data?.find((t) => t.id === active.data!.task_id);
  const elapsed = now - active.data.started_at;

  return (
    <div className="sticky top-0 z-40 border-b border-emerald-700 bg-emerald-600 text-white shadow-sm dark:bg-emerald-700 dark:border-emerald-800">
      <Link
        to="/"
        className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-colors"
      >
        <Clock className="size-4 shrink-0 animate-pulse" />
        <span
          className="inline-block size-2 rounded-full shrink-0"
          style={{ backgroundColor: project?.color }}
        />
        <span className="font-medium truncate">
          {project?.name || `#${active.data.project_id}`}
          {task && <span className="opacity-80"> — {task.name}</span>}
        </span>
        <span className="font-mono tabular-nums ml-auto shrink-0">{formatDuration(elapsed)}</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 hover:bg-white/15 text-white"
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await stop.mutateAsync();
            toast.success('Stopped');
          }}
          disabled={stop.isPending}
          aria-label="Stop timer"
        >
          <Square className="size-4" />
        </Button>
      </Link>
    </div>
  );
}
