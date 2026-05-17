import { ReactNode } from "react";
import { Map, Info, Trophy } from "lucide-react";
import { ConnectionStatus } from "./ConnectionStatus";
import { useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { LanguageSelector } from "./LanguageSelector";

// Main page layout wrapper - provides header, styling, and connection status indicator
// Uses: OpenStreetMap, GeoCLIP, and Ministral models
export default function Layout({
  children,
  onShowAchievements,
  hasAchievements = true
}: {
  children: ReactNode;
  onShowAchievements?: () => void;
  hasAchievements?: boolean;
}) {
  const [showCredits, setShowCredits] = useState(false);
  const { t } = useI18n();

  return (
    <div className="min-h-[100svh] w-full bg-background flex items-center justify-center p-1.5 sm:p-2">
      <ConnectionStatus />
      <div className="w-full max-w-6xl relative">
        <div className="pointer-events-none absolute -top-12 -left-10 h-28 w-28 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-6 -right-4 h-24 w-24 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="flex items-center justify-between mb-2 md:mb-3 px-1">
          <div className="flex items-center gap-1.5">
            <Map className="text-primary-dark w-5 h-5 md:w-6 md:h-6" size={24} />
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-primary">
              SpotTheShot
            </h1>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {/* Language selector */}
            <LanguageSelector />

            {/* Achievements — always visible, text hidden on small screens */}
            {onShowAchievements && hasAchievements && (
              <button
                onClick={onShowAchievements}
                className="text-xs text-text-darker hover:text-primary flex items-center gap-1 p-1"
                title={t("layout.viewAchievements")}
              >
                <Trophy size={18} className="text-yellow-400" />
                <span className="hidden lg:inline">{t("layout.achievements")}</span>
              </button>
            )}

            {/* Credits — always visible, text hidden on small screens */}
            <button
              onClick={() => setShowCredits(!showCredits)}
              className="text-xs text-text-darker hover:text-primary flex items-center gap-1 p-1"
              title={t("layout.viewCredits")}
            >
              <Info size={18} />
              <span className="hidden lg:inline">{t("layout.credits")}</span>
            </button>
          </div>
        </div>
        {showCredits && (
          <div className="mb-4 p-3 bg-black/30 rounded-lg border border-primary/20 text-xs text-text-darker space-y-1">
            <div>
              <a
                href="https://fabiobarbero.eu"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {t('common.madeWithLove')} Fabio Barbero
              </a>
            </div>
            <div>
              🗺️ Map tiles:{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                OpenStreetMap contributors
              </a>{" "}
              (using Leaflet)
            </div>
            <div>
              📍 Geolocation:{" "}
              <a
                href="https://github.com/fbarbe00/FastGeoCLIP"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                FastGeoCLIP
              </a>{" "}
              (running on the server)
            </div>
            <div>
              🤖 Image analysis:{" "}
              <a
                href="https://huggingface.co/unsloth/Ministral-3-3B-Instruct-2512-GGUF"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Ministral-3
              </a>{" "}
              (running on the server)
            </div>
            <div>
              🇺🇳 Geographical boundaries data:{" "}
              <a href="https://www.geoboundaries.org/"
              target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Geoboundaries.org
              </a>{" "}
              (running on the server)
            </div>
          </div>
        )}
        <div className="bg-surface/90 backdrop-blur-md rounded-xl shadow-2xl shadow-black/50 p-2 md:p-3 border border-primary/20">
          {children}
        </div>
      </div>
    </div>
  );
}
