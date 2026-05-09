import { useState } from 'react';
import { Plus, Archive, Trash2, Pencil, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/confirm-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  useCreateProject,
  useCreateTask,
  useDeleteProject,
  useDeleteTask,
  useProjects,
  useTasks,
  useUpdateProject,
  useUpdateTask,
} from '@/hooks/data';
import { toast } from 'sonner';
import type { Project } from '@/lib/api';

const COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#ec4899',
];

export function ProjectsPage() {
  const projects = useProjects(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [openProject, setOpenProject] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">Manage projects and tasks.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New project
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.data?.map((p) => (
          <Card key={p.id} className={p.archived_at ? 'opacity-60' : ''}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
                {p.archived_at && (
                  <span className="text-xs font-normal text-muted-foreground">(archived)</span>
                )}
              </CardTitle>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(p)}>
                  <Pencil className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => setOpenProject(p.id)}>
                Tasks
              </Button>
            </CardContent>
          </Card>
        ))}
        {projects.data?.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">
            No projects yet. Create your first one.
          </div>
        )}
      </div>

      {creating && <ProjectDialog onClose={() => setCreating(false)} />}
      {editing && <ProjectDialog project={editing} onClose={() => setEditing(null)} />}
      {openProject && <TasksDialog projectId={openProject} onClose={() => setOpenProject(null)} />}
    </div>
  );
}

function ProjectDialog({ project, onClose }: { project?: Project; onClose: () => void }) {
  const [name, setName] = useState(project?.name || '');
  const [color, setColor] = useState(project?.color || COLORS[0]);
  const create = useCreateProject();
  const update = useUpdateProject();
  const del = useDeleteProject();

  const save = async () => {
    if (!name.trim()) return;
    try {
      if (project) {
        await update.mutateAsync({ id: project.id, name, color });
        toast.success('Updated');
      } else {
        await create.mutateAsync({ name, color });
        toast.success('Created');
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? 'Edit project' : 'New project'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`size-8 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {project && (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  await update.mutateAsync({ id: project.id, archived: !project.archived_at });
                  toast.success(project.archived_at ? 'Restored' : 'Archived');
                  onClose();
                }}
              >
                {project.archived_at ? (
                  <ArchiveRestore className="size-4" />
                ) : (
                  <Archive className="size-4" />
                )}
                {project.archived_at ? 'Restore' : 'Archive'}
              </Button>
              <ConfirmButton
                variant="destructive"
                destructive
                title="Delete this project?"
                description="Tracks will retain a reference to it. If the project has tracks it will be archived instead."
                confirmLabel="Delete"
                onConfirm={async () => {
                  await del.mutateAsync(project.id);
                  toast.success('Deleted');
                  onClose();
                }}
              >
                <Trash2 className="size-4" /> Delete
              </ConfirmButton>
            </>
          )}
          <div className="flex-1" />
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TasksDialog({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const tasks = useTasks(projectId, true);
  const [newName, setNewName] = useState('');
  const create = useCreateTask();
  const update = useUpdateTask();
  const del = useDeleteTask();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tasks</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              await create.mutateAsync({ project_id: projectId, name: newName });
              setNewName('');
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New task name"
            />
            <Button type="submit">
              <Plus className="size-4" />
            </Button>
          </form>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {tasks.data?.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-2 p-2 rounded-md hover:bg-accent ${t.archived_at ? 'opacity-60' : ''}`}
              >
                <span className="flex-1 text-sm">{t.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => update.mutate({ id: t.id, archived: !t.archived_at })}
                  title={t.archived_at ? 'Restore' : 'Archive'}
                >
                  {t.archived_at ? (
                    <ArchiveRestore className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                </Button>
                <ConfirmButton
                  size="icon"
                  variant="ghost"
                  destructive
                  title="Delete this task?"
                  description="This action cannot be undone."
                  confirmLabel="Delete"
                  onConfirm={() => del.mutate(t.id)}
                >
                  <Trash2 className="size-4" />
                </ConfirmButton>
              </div>
            ))}
            {tasks.data?.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">No tasks yet.</div>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
