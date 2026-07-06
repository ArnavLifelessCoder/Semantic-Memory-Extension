import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '../Icon';
import { getSettings, saveSettings } from '../storage';
import { metadataStore } from '../../store/metadata-store';
import { resetIndex, pruneNoisePages } from '../engine';
import { applyTheme } from '../theme';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../../types';

function Toggle({ active, onChange, label }: { active: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={`toggle ${active ? 'active' : ''}`}
      onClick={() => onChange(!active)}
      role="switch"
      aria-checked={active}
      aria-label={label}
      style={{ padding: 0 }}
    />
  );
}

const THEMES: { id: ExtensionSettings['theme']; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'auto', label: 'Auto' },
];

export function SettingsTab() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings
  useEffect(() => {
    let alive = true;
    void getSettings().then((s) => {
      if (!alive) return;
      setSettings(s);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // Save settings
  const handleSave = useCallback(async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [settings]);

  // Theme applies instantly and persists immediately.
  const handleTheme = useCallback((theme: ExtensionSettings['theme']) => {
    applyTheme(theme);
    setSettings(prev => {
      const next = { ...prev, theme };
      void saveSettings(next);
      return next;
    });
  }, []);

  // Pause/resume indexing persists immediately (the content script reads it live).
  const handleIndexingToggle = useCallback((enabled: boolean) => {
    setSettings(prev => {
      const next = { ...prev, indexingEnabled: enabled };
      void saveSettings(next);
      return next;
    });
  }, []);

  // Import a backup produced by Export
  const handleImport = useCallback(async (file: File) => {
    setExportStatus('Importing…');
    try {
      const text = await file.text();
      const count = await metadataStore.importAll(text);
      await resetIndex();
      setExportStatus(`Imported ${count} pages`);
    } catch (err) {
      console.error('[Settings] import failed:', err);
      setExportStatus('Import failed — not a valid backup file');
    }
    setTimeout(() => setExportStatus(null), 4000);
  }, []);

  // Add blacklisted domain
  const addDomain = useCallback(() => {
    const domain = newDomain.trim().toLowerCase().replace(/^(https?:\/\/)?/, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (domain && !settings.blacklistedDomains.includes(domain)) {
      setSettings(prev => ({
        ...prev,
        blacklistedDomains: [...prev.blacklistedDomains, domain],
      }));
      setNewDomain('');
    }
  }, [newDomain, settings.blacklistedDomains]);

  const removeDomain = useCallback((domain: string) => {
    setSettings(prev => ({
      ...prev,
      blacklistedDomains: prev.blacklistedDomains.filter(d => d !== domain),
    }));
  }, []);

  // Export data
  const handleExport = useCallback(async () => {
    setExportStatus('Exporting…');
    try {
      const { json, count } = await metadataStore.exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `semantic-memory-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus(`Exported ${count} pages`);
    } catch {
      setExportStatus('Export failed');
    }
    setTimeout(() => setExportStatus(null), 3000);
  }, []);

  // Remove indexed noise pages (SERPs, chat app shells, webmail)
  const handlePruneNoise = useCallback(async () => {
    setExportStatus('Cleaning…');
    try {
      const removed = await pruneNoisePages();
      setExportStatus(removed > 0 ? `Removed ${removed} noise page${removed !== 1 ? 's' : ''}` : 'No noise pages found');
    } catch (err) {
      console.error('[Settings] prune failed:', err);
      setExportStatus('Cleanup failed');
    }
    setTimeout(() => setExportStatus(null), 3000);
  }, []);

  // Clear data
  const handleClear = useCallback(async () => {
    try {
      await metadataStore.clearAll();
      await resetIndex();
    } catch (err) {
      console.error('[Settings] clear failed:', err);
    }
    setClearConfirm(false);
    setExportStatus('All data cleared');
    setTimeout(() => setExportStatus(null), 3000);
  }, []);

  if (!loaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="shimmer" style={{ height: 40, borderRadius: 'var(--radius-sm)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {/* Save status */}
      {saved && (
        <div className="alert alert-success animate-slide-down">
          <Icon name="check" size={14} /> Settings saved
        </div>
      )}
      {exportStatus && (
        <div className="alert alert-info animate-slide-down">
          {exportStatus}
        </div>
      )}

      {/* Appearance */}
      <div style={{ padding: '4px 0' }}>
        <div className="flex items-center gap-xs text-xs font-semibold text-accent" style={{ padding: '4px 12px 8px' }}>
          <Icon name="sparkle" size={13} /> Appearance
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Theme</div>
            <div className="setting-description">Auto follows your system preference</div>
          </div>
          <div className="flex gap-xs" role="group" aria-label="Theme">
            {THEMES.map(t => (
              <button
                key={t.id}
                className={`chip ${settings.theme === t.id ? 'active' : ''}`}
                style={{ border: 'none', fontFamily: 'inherit' }}
                onClick={() => handleTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="separator" />

      {/* Indexing */}
      <div style={{ padding: '4px 0' }}>
        <div className="flex items-center gap-xs text-xs font-semibold text-accent" style={{ padding: '4px 12px 8px' }}>
          <Icon name="bolt" size={13} /> Indexing
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Index pages as you browse</div>
            <div className="setting-description">Pause to stop capturing new pages temporarily</div>
          </div>
          <Toggle
            active={settings.indexingEnabled}
            onChange={handleIndexingToggle}
            label="Index pages as you browse"
          />
        </div>
      </div>

      <div className="separator" />

      {/* Domain Blacklist */}
      <div style={{ padding: '4px 0' }}>
        <div className="flex items-center gap-xs text-xs font-semibold text-accent" style={{ padding: '4px 12px 8px' }}>
          <Icon name="ban" size={13} /> Domain Blacklist
        </div>
        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div className="text-xs text-muted">
            Pages from these domains won't be indexed
          </div>
          <div className="flex gap-xs">
            <input
              className="input"
              style={{ fontSize: '12px', padding: '6px 10px' }}
              placeholder="e.g. gmail.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addDomain(); }}
            />
            <button className="btn btn-ghost btn-sm" onClick={addDomain} disabled={!newDomain.trim()}>
              Add
            </button>
          </div>
          {settings.blacklistedDomains.length > 0 && (
            <div className="flex gap-xs" style={{ flexWrap: 'wrap' }}>
              {settings.blacklistedDomains.map(domain => (
                <span key={domain} className="chip" onClick={() => removeDomain(domain)}>
                  {domain}
                  <Icon name="close" size={11} style={{ marginLeft: '2px', opacity: 0.6 }} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="separator" />

      {/* Sync Settings */}
      <div style={{ padding: '4px 0' }}>
        <div className="flex items-center gap-xs text-xs font-semibold text-accent" style={{ padding: '4px 12px 8px' }}>
          <Icon name="cloud" size={13} /> Cross-Device Sync
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Enable Sync</div>
            <div className="setting-description">End-to-end encrypted with AES-256-GCM</div>
          </div>
          <Toggle
            active={settings.syncEnabled}
            onChange={(v) => setSettings(prev => ({ ...prev, syncEnabled: v }))}
            label="Enable sync"
          />
        </div>
        {settings.syncEnabled && (
          <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              className="input"
              style={{ fontSize: '12px', padding: '6px 10px' }}
              placeholder="API URL (e.g. http://localhost:8000)"
              value={settings.syncApiUrl}
              onChange={(e) => setSettings(prev => ({ ...prev, syncApiUrl: e.target.value }))}
            />
            <input
              className="input"
              style={{ fontSize: '12px', padding: '6px 10px' }}
              placeholder="Access Token"
              type="password"
              value={settings.syncToken}
              onChange={(e) => setSettings(prev => ({ ...prev, syncToken: e.target.value }))}
            />
          </div>
        )}
      </div>

      <div className="separator" />

      {/* Data Management */}
      <div style={{ padding: '4px 0' }}>
        <div className="flex items-center gap-xs text-xs font-semibold text-accent" style={{ padding: '4px 12px 8px' }}>
          <Icon name="database" size={13} /> Data Management
        </div>
        <div className="setting-row" style={{ paddingTop: 0, paddingBottom: '8px' }}>
          <div>
            <div className="setting-label">Clean up noise pages</div>
            <div className="setting-description">Remove indexed search-result pages, chat apps and webmail</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ gap: '5px', flexShrink: 0 }} onClick={() => void handlePruneNoise()}>
            <Icon name="sparkle" size={13} /> Clean
          </button>
        </div>
        <div className="flex gap-sm" style={{ padding: '0 12px' }}>
          <button className="btn btn-ghost btn-sm flex-1" style={{ gap: '5px' }} onClick={handleExport}>
            <Icon name="download" size={13} /> Export
          </button>
          <button className="btn btn-ghost btn-sm flex-1" style={{ gap: '5px' }} onClick={() => fileInputRef.current?.click()}>
            <Icon name="plus" size={13} /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = '';
            }}
          />
          {!clearConfirm ? (
            <button className="btn btn-danger btn-sm flex-1" style={{ gap: '5px' }} onClick={() => setClearConfirm(true)}>
              <Icon name="trash" size={13} /> Clear all
            </button>
          ) : (
            <button className="btn btn-danger btn-sm flex-1" onClick={handleClear}
              style={{ gap: '5px', animation: 'pulse 1s ease-in-out infinite' }}>
              <Icon name="alert" size={13} /> Confirm clear
            </button>
          )}
        </div>
      </div>

      <div className="separator" />

      {/* Save button */}
      <div style={{ padding: '8px 12px' }}>
        <button className="btn btn-primary w-full" onClick={handleSave}>
          Save Settings
        </button>
      </div>

      {/* Footer */}
      <div className="text-xs text-muted" style={{ textAlign: 'center', padding: '4px' }}>
        Semantic Memory v2.2 · 100% On-Device AI · Tip: type “mem” in the address bar
      </div>
    </div>
  );
}
