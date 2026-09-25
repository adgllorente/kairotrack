import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/confirm-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/select-native';
import { toast } from 'sonner';
import { useProjects } from '@/hooks/data';
import {
  useConfigureTelegram,
  useCreateTelegramGoal,
  useCreateTelegramLinkCode,
  useDeleteTelegram,
  useDeleteTelegramGoal,
  useTelegramGoals,
  useTelegramStatus,
  useTestTelegram,
  useUpdateTelegramGoal,
} from '@/hooks/data';

function formatGoal(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return rest + ' min';
  return hours + ' h' + (rest ? ' ' + rest + ' min' : '');
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function formatDailyGoal(values: (number | null)[] | undefined, fallback: number) {
  if (!values) return formatGoal(fallback);
  return values
    .map((value, index) => `${DAY_LABELS[index]} ${value === null ? '—' : formatGoal(value)}`)
    .join(' · ');
}

export function TelegramSettings() {
  const status = useTelegramStatus();
  const goals = useTelegramGoals();
  const projects = useProjects();
  const test = useTestTelegram();
  const configure = useConfigureTelegram();
  const disconnect = useDeleteTelegram();
  const linkCode = useCreateTelegramLinkCode();
  const createGoal = useCreateTelegramGoal();
  const updateGoal = useUpdateTelegramGoal();
  const deleteGoal = useDeleteTelegramGoal();
  const [token, setToken] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState<string[]>(Array(7).fill('480'));
  const [projectId, setProjectId] = useState('');
  const [projectMinutes, setProjectMinutes] = useState('120');
  const [code, setCode] = useState<string | null>(null);
  const globalGoal = goals.data?.find((goal) => goal.project_id === null);

  useEffect(() => {
    if (!globalGoal) return;
    const values = globalGoal.target_minutes_by_day ?? Array(7).fill(globalGoal.target_minutes);
    setDailyMinutes(values.map((value) => (value === null ? '' : String(value))));
  }, [globalGoal]);

  async function onTest() {
    if (!token.trim()) return;
    try {
      const result = await test.mutateAsync(token.trim());
      toast.success('Conexión correcta con @' + result.username);
    } catch {
      toast.error('No se pudo conectar con Telegram');
    }
  }

  async function onConfigure() {
    if (!token.trim()) return;
    try {
      const result = await configure.mutateAsync(token.trim());
      setToken('');
      toast.success('Bot @' + result.username + ' configurado');
    } catch {
      toast.error('El token de Telegram no es válido');
    }
  }

  async function onLinkCode() {
    try {
      const result = await linkCode.mutateAsync();
      setCode(result.code);
    } catch {
      toast.error('No se pudo generar el código');
    }
  }

  async function saveDailyGoal() {
    const values = dailyMinutes.map((value) => {
      if (value.trim() === '') return null;
      const minutes = Number(value);
      return Number.isInteger(minutes) && minutes >= 1 && minutes <= 24 * 60 ? minutes : NaN;
    });
    if (values.some((value) => Number.isNaN(value)) || values.every((value) => value === null)) {
      toast.error('Introduce entre 1 y 1440 minutos para al menos un día');
      return;
    }
    const targetMinutes = values.find((value): value is number => value !== null) as number;
    try {
      if (globalGoal) {
        await updateGoal.mutateAsync({
          id: globalGoal.id,
          target_minutes: targetMinutes,
          target_minutes_by_day: values,
        });
      } else {
        await createGoal.mutateAsync({
          project_id: null,
          target_minutes: targetMinutes,
          target_minutes_by_day: values,
        });
      }
      toast.success('Objetivo diario guardado');
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === 'goal_already_exists'
          ? 'Ya existe un objetivo diario'
          : 'No se pudo guardar el objetivo diario',
      );
    }
  }

  async function addProjectGoal(minutes: string) {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 1) return;
    try {
      await createGoal.mutateAsync({ project_id: Number(projectId), target_minutes: value });
      setProjectMinutes('120');
      toast.success('Objetivo guardado');
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === 'goal_already_exists'
          ? 'Ya existe un objetivo para ese alcance'
          : 'No se pudo guardar el objetivo',
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>
          Controla tus tracks con un bot y recibe un aviso diario al alcanzar tus objetivos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div className="font-medium">Configuración rápida</div>
          <div>1. Habla con @BotFather en Telegram y usa /newbot.</div>
          <div>2. Copia el token que te entregue y pégalo abajo.</div>
          <div>
            3. Genera un código, abre tu bot y envía <code>/link CÓDIGO</code>.
          </div>
          <div>4. Usa /start, /active, /stop, /today o /week desde Telegram.</div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="telegram-token">Token del bot</Label>
          <div className="flex gap-2">
            <Input
              id="telegram-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456:ABC..."
            />
            <Button
              type="button"
              variant="outline"
              onClick={onTest}
              disabled={!token.trim() || test.isPending}
            >
              Probar
            </Button>
            <Button
              type="button"
              onClick={onConfigure}
              disabled={!token.trim() || configure.isPending}
            >
              Guardar
            </Button>
          </div>
        </div>

        {status.data?.configured && (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-muted-foreground">
              Bot @{status.data.username ?? 'configurado'} ·{' '}
              {status.data.running ? 'activo' : 'detenido'} ·{' '}
              {status.data.linked ? 'chat vinculado' : 'chat pendiente'}
            </span>
            <ConfirmButton
              variant="outline"
              size="sm"
              destructive
              title="¿Desconectar Telegram?"
              description="Se eliminará la configuración del bot y el chat vinculado."
              confirmLabel="Desconectar"
              onConfirm={() => disconnect.mutate()}
            >
              Desconectar
            </ConfirmButton>
          </div>
        )}

        {status.data?.configured && !status.data.linked && (
          <div className="flex items-center gap-3 rounded-md border p-3">
            <Button
              type="button"
              variant="outline"
              onClick={onLinkCode}
              disabled={linkCode.isPending}
            >
              Generar código de vinculación
            </Button>
            {code && <code className="font-mono font-bold tracking-widest">/link {code}</code>}
          </div>
        )}

        {status.data?.configured && (
          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="font-medium">Objetivos diarios</h3>
              <p className="text-sm text-muted-foreground">
                Se comprueban cada minuto mientras trabajas y se avisa una vez por día.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(
                (day, index) => (
                  <div key={day} className="space-y-1">
                    <Label htmlFor={`telegram-total-${index}`}>{day}</Label>
                    <Input
                      id={`telegram-total-${index}`}
                      type="number"
                      min="1"
                      max={24 * 60}
                      placeholder="Sin aviso"
                      value={dailyMinutes[index]}
                      onChange={(e) => {
                        const next = [...dailyMinutes];
                        next[index] = e.target.value;
                        setDailyMinutes(next);
                      }}
                      className="w-28"
                    />
                  </div>
                ),
              )}
              <Button type="button" onClick={saveDailyGoal}>
                {globalGoal ? 'Guardar total diario' : 'Añadir total diario'}
              </Button>
            </div>
            <div className="border-t pt-4 space-y-3">
              <div>
                <h4 className="font-medium">Objetivos por proyecto</h4>
                <p className="text-sm text-muted-foreground">
                  Se aplican cada día al tiempo acumulado de ese proyecto.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label>Proyecto</Label>
                  <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">Selecciona un proyecto</option>
                    {projects.data?.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="telegram-project">Minutos diarios</Label>
                  <Input
                    id="telegram-project"
                    type="number"
                    min="1"
                    value={projectMinutes}
                    onChange={(e) => setProjectMinutes(e.target.value)}
                    className="w-36"
                  />
                </div>
                <Button
                  type="button"
                  disabled={!projectId}
                  onClick={() => addProjectGoal(projectMinutes)}
                >
                  Añadir proyecto
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {goals.data?.map((goal) => {
                const project = goal.project_id
                  ? projects.data?.find((item) => item.id === goal.project_id)
                  : undefined;
                return (
                  <div
                    key={goal.id}
                    className="flex items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <span className="flex-1">
                      {project?.name ?? 'Total diario'}:{' '}
                      {formatDailyGoal(goal.target_minutes_by_day, goal.target_minutes)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateGoal.mutate({ id: goal.id, enabled: !goal.enabled })}
                    >
                      {goal.enabled ? 'Desactivar' : 'Activar'}
                    </Button>
                    <ConfirmButton
                      size="icon"
                      variant="ghost"
                      destructive
                      title="¿Eliminar objetivo?"
                      description="Se dejará de comprobar este objetivo."
                      confirmLabel="Eliminar"
                      onConfirm={() => deleteGoal.mutate(goal.id)}
                    >
                      <Trash2 className="size-4" />
                    </ConfirmButton>
                  </div>
                );
              })}
              {goals.data?.length === 0 && (
                <div className="text-sm text-muted-foreground">No hay objetivos configurados.</div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
