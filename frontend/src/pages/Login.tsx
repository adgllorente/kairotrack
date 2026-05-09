import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin, useMe } from '@/hooks/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';

export function LoginPage() {
  const navigate = useNavigate();
  const me = useMe();
  const login = useLogin();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');

  if (me.data?.user) {
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <img
            src="/logo.svg"
            alt="kairotrack"
            className="h-9 w-auto dark:invert"
          />
          <CardDescription>Sign in to your tracker</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await login.mutateAsync({ user, password });
                navigate('/');
              } catch {
                toast.error('Invalid credentials');
              }
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="user">User</Label>
              <Input
                id="user"
                autoFocus
                value={user}
                onChange={(e) => setUser(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
