import React, { useState } from 'react';
import { Shield, Lock, Mail, User, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isRegister) {
        await api.auth.register(email, password, name);
      } else {
        await api.auth.login(email, password);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const fillQuickAccount = (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <h3 className="text-base font-bold text-white">
              {isRegister ? 'Register Enterprise Operator' : 'Sign in to ResilienceX'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Sarah Connor"
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Corporate Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@resiliencex.io"
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Master Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Quick Pre-filled Credentials for Reviewer Convenience */}
          <div className="pt-1">
            <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
              Quick Test Credentials:
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fillQuickAccount('admin@resiliencex.io', 'ResilienceX2026!')}
                className="flex-1 py-1 px-2 text-[11px] font-mono text-slate-300 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded transition-colors text-left truncate"
              >
                Lead Admin
              </button>
              <button
                type="button"
                onClick={() => fillQuickAccount('jitenmoni8@gmail.com', 'ResilienceX2026!')}
                className="flex-1 py-1 px-2 text-[11px] font-mono text-slate-300 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded transition-colors text-left truncate"
              >
                Jiten Moni (Candidate)
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Authenticating...' : isRegister ? 'Register Account' : 'Sign In'}
            </button>
          </div>
        </form>

        <div className="mt-4 pt-3 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="text-xs text-blue-400 hover:underline"
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
};
