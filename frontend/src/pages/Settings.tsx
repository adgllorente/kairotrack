import { useRef, useState } from 'react';
import { Plus, Trash2, Copy, Check, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/confirm-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useApiKeys,
  useCreateApiKey,
  useImportTracks,
  useRevokeApiKey,
  type ImportResult,
} from '@/hooks/data';
import { useTheme } from '@/components/theme-provider';
import { NativeSelect } from '@/components/ui/select-native';
import { toast } from 'sonner';

export function SettingsPage() {
  const keys = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const importMut = useImportTracks();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const { theme, setTheme } = useTheme();

  async function onPickFile(file: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error('Invalid JSON file');
      return;
    }
    try {
      const res = await importMut.mutateAsync(parsed);
      setLastResult(res);
      toast.success(
        `Imported ${res.imported} track${res.imported === 1 ? '' : 's'}` +
          (res.skipped ? ` · ${res.skipped} skipped` : ''),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Theme preference</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-w-xs">
            <Label>Theme</Label>
            <NativeSelect
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import</CardTitle>
          <CardDescription>
            Import a <code className="text-xs bg-muted px-1 rounded">kairotrack-export.json</code>{' '}
            from another instance. Projects and tasks are matched by name and created if missing.
            Duplicate tracks (same project + start + end) are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
            }}
          />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importMut.isPending}
          >
            <Upload className="size-4" />
            {importMut.isPending ? 'Importing…' : 'Choose JSON file'}
          </Button>
          {lastResult && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div>
                Imported <span className="text-foreground font-medium">{lastResult.imported}</span>{' '}
                · skipped {lastResult.skipped} · new projects {lastResult.projects_created} · new
                tasks {lastResult.tasks_created}
              </div>
              {lastResult.errors.length > 0 && (
                <ul className="text-xs list-disc pl-4">
                  {lastResult.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Use <code className="text-xs bg-muted px-1 rounded">X-API-Key</code> header or{' '}
            <code className="text-xs bg-muted px-1 rounded">Authorization: Bearer</code> to
            authenticate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!label.trim()) return;
              try {
                const res = await create.mutateAsync(label);
                setCreatedKey(res.key);
                setLabel('');
              } catch {
                toast.error('Failed');
              }
            }}
          >
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. cli, mobile)"
            />
            <Button type="submit">
              <Plus className="size-4" /> Generate
            </Button>
          </form>

          <div className="space-y-1">
            {keys.data?.map((k) => (
              <div
                key={k.id}
                className={`flex items-center gap-2 p-2 rounded-md border ${k.revoked_at ? 'opacity-50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{k.label}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    kt_{k.prefix}_••••••••
                    {k.last_used_at && (
                      <span className="ml-2">
                        last used {format(k.last_used_at * 1000, 'yyyy-MM-dd HH:mm')}
                      </span>
                    )}
                  </div>
                </div>
                {!k.revoked_at && (
                  <ConfirmButton
                    size="icon"
                    variant="ghost"
                    destructive
                    title="Revoke this API key?"
                    description="The key will stop working immediately. This cannot be undone."
                    confirmLabel="Revoke"
                    onConfirm={() => revoke.mutate(k.id)}
                  >
                    <Trash2 className="size-4" />
                  </ConfirmButton>
                )}
                {k.revoked_at && <span className="text-xs text-muted-foreground">revoked</span>}
              </div>
            ))}
            {keys.data?.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">No keys yet.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {createdKey && (
        <Dialog open onOpenChange={(o) => !o && setCreatedKey(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Your new API key</DialogTitle>
              <DialogDescription>Copy it now — it won't be shown again.</DialogDescription>
            </DialogHeader>
            <div className="bg-muted p-3 rounded-md font-mono text-sm break-all">{createdKey}</div>
            <DialogFooter>
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(createdKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="outline" onClick={() => setCreatedKey(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
