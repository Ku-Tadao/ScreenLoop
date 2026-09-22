import { useState, useEffect } from 'react';
import { useSettings, useSettingsUpdater } from '../Context/SettingsContext';
import { useUpdate } from '../Context/UpdateContext';
import VideoSettingsSection from '../Components/Settings/VideoSettingsSection';
import StorageSettingsSection from '../Components/Settings/StorageSettingsSection';
import ClipSettingsSection from '../Components/Settings/ClipSettingsSection';
import AudioDevicesSection from '../Components/Settings/AudioDevicesSection';
import KeybindingsSection from '../Components/Settings/KeybindingsSection';
import PreferencesSection from '../Components/Settings/PreferencesSection';
import MenuCustomizationSection from '../Components/Settings/MenuCustomizationSection';
import AdvancedSection from '../Components/Settings/AdvancedSection';

type SectionId = 'recording' | 'audio' | 'clips' | 'storage' | 'preferences' | 'advanced';

const NAV_ITEMS: { id: SectionId; label: string }[] = [
  { id: 'recording', label: 'Recording' },
  { id: 'audio', label: 'Audio' },
  { id: 'clips', label: 'Clip export' },
  { id: 'storage', label: 'Storage' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'advanced', label: 'Updates & diagnostics' },
];

function SectionHeader({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="settings-section-title scroll-mt-48 mb-0">
      <h2 className="text-lg font-semibold mb-3 mt-8">{children}</h2>
    </div>
  );
}

export default function Settings() {
  const { openReleaseNotesModal, checkForUpdates } = useUpdate();
  const settings = useSettings();
  const updateSettings = useSettingsUpdater();
  const [activeSection, setActiveSection] = useState<SectionId>('recording');

  const scrollToSection = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll spy to track which section is currently visible
  useEffect(() => {
    const handleScroll = () => {
      const viewportCenter = window.innerHeight / 2.3; // Check upper-third of viewport

      // Find the last section whose top has passed the check point
      for (let i = NAV_ITEMS.length - 1; i >= 0; i--) {
        const element = document.getElementById(NAV_ITEMS[i].id);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= viewportCenter) {
            setActiveSection(NAV_ITEMS[i].id);
            return;
          }
        }
      }

      // Default to first section if none found
      setActiveSection(NAV_ITEMS[0].id);
    };

    window.addEventListener('scroll', handleScroll, true);
    handleScroll(); // Initial check

    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  return (
    <div className="settings-page min-h-full bg-base-200">
      {/* Sticky Jump Nav */}
      <div className="settings-heading sticky top-0 z-30 border-b border-screen-line/60 bg-base-200">
        <div>
          <p className="eyebrow">Make it yours</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Settings</h1>
          <nav className="mt-5 flex gap-1 overflow-x-auto" aria-label="Settings sections">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                aria-current={activeSection === item.id ? 'location' : undefined}
                className={`shrink-0 border-b-2 px-3 py-3 text-sm transition-colors cursor-pointer ${
                  activeSection === item.id
                    ? 'text-primary border-primary'
                    : 'text-screen-muted border-transparent hover:text-base-content'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="settings-content space-y-4">
        <p className="text-sm text-base-content/70">
          Changes are saved automatically. Recording settings and clip export settings are
          independent.
        </p>
        {/* RECORDING */}
        <SectionHeader id="recording">Recording</SectionHeader>
        <VideoSettingsSection settings={settings} updateSettings={updateSettings} />
        <KeybindingsSection settings={settings} updateSettings={updateSettings} />

        <SectionHeader id="audio">Audio</SectionHeader>
        <AudioDevicesSection settings={settings} updateSettings={updateSettings} />

        {/* CLIPS */}
        <SectionHeader id="clips">Clip export</SectionHeader>
        <ClipSettingsSection settings={settings} updateSettings={updateSettings} />

        {/* STORAGE */}
        <SectionHeader id="storage">Storage</SectionHeader>
        <StorageSettingsSection settings={settings} updateSettings={updateSettings} />

        {/* PREFERENCES */}
        <SectionHeader id="preferences">Preferences</SectionHeader>
        <PreferencesSection settings={settings} updateSettings={updateSettings} />
        <MenuCustomizationSection settings={settings} updateSettings={updateSettings} />

        {/* ADVANCED */}
        <SectionHeader id="advanced">Updates & diagnostics</SectionHeader>
        <AdvancedSection
          settings={settings}
          updateSettings={updateSettings}
          openReleaseNotesModal={openReleaseNotesModal}
          checkForUpdates={checkForUpdates}
        />
      </div>
    </div>
  );
}
