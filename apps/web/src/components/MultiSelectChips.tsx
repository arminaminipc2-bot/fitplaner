import { useState, useId } from "react";
import { Check, Plus, X } from "lucide-react";
import type { PresetItem } from "../lib/profile-presets";
import { TextInput, cx } from "./ui";

export function MultiSelectChips({
  label,
  hint,
  presets,
  selected,
  onToggle,
  otherValue,
  onOtherChange,
  otherPlaceholder = "مورد دیگر را اینجا بنویسید (هوش مصنوعی آن را در برنامه لحاظ می‌کند)...",
  groupCategories = true,
}: {
  label: string;
  hint?: string;
  presets: PresetItem[];
  selected: string[];
  onToggle: (label: string) => void;
  otherValue: string;
  onOtherChange: (val: string) => void;
  otherPlaceholder?: string;
  groupCategories?: boolean;
}) {
  const otherInputId = useId();
  const [showOtherInput, setShowOtherInput] = useState(() => otherValue.trim().length > 0);

  const categories = groupCategories
    ? Array.from(new Set(presets.map((p) => p.category).filter(Boolean) as string[]))
    : [];

  const handleToggleOther = () => {
    if (showOtherInput) {
      if (otherValue.trim().length > 0) {
        onOtherChange("");
      }
      setShowOtherInput(false);
    } else {
      setShowOtherInput(true);
    }
  };

  const isOtherActive = showOtherInput || otherValue.trim().length > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <label className="text-sm font-semibold text-ink">{label}</label>
        {hint ? <span className="text-2xs text-ink-3 leading-relaxed">{hint}</span> : null}
      </div>

      {categories.length > 0 ? (
        <div className="flex flex-col gap-3">
          {categories.map((cat) => {
            const catPresets = presets.filter((p) => p.category === cat);
            return (
              <div key={cat} className="flex flex-col gap-1.5">
                <span className="text-2xs font-bold text-ink-3 tracking-wide">{cat}</span>
                <div className="flex flex-wrap gap-2">
                  {catPresets.map((preset) => {
                    const isSelected = selected.includes(preset.label);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onToggle(preset.label)}
                        className={cx(
                          "group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-150 select-none",
                          "active:scale-95",
                          isSelected
                            ? "border border-ink bg-white text-zinc-950 font-semibold shadow-sm"
                            : "border border-line/80 bg-card-2 text-ink-2 hover:border-line hover:bg-card-3 hover:text-ink",
                        )}
                      >
                        {isSelected ? (
                          <Check size={13} strokeWidth={2.6} className="text-zinc-950" aria-hidden />
                        ) : null}
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const isSelected = selected.includes(preset.label);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onToggle(preset.label)}
                className={cx(
                  "group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-150 select-none",
                  "active:scale-95",
                  isSelected
                    ? "border border-ink bg-white text-zinc-950 font-semibold shadow-sm"
                    : "border border-line/80 bg-card-2 text-ink-2 hover:border-line hover:bg-card-3 hover:text-ink",
                )}
              >
                {isSelected ? (
                  <Check size={13} strokeWidth={2.6} className="text-zinc-950" aria-hidden />
                ) : null}
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Other / Custom Option */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleOther}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-150 select-none",
              "active:scale-95",
              isOtherActive
                ? "border border-dashed border-ink bg-card-3 text-ink font-semibold"
                : "border border-dashed border-line bg-card-2/60 text-ink-3 hover:border-ink/50 hover:text-ink",
            )}
          >
            {isOtherActive ? <Check size={12} strokeWidth={2.5} /> : <Plus size={12} strokeWidth={2} />}
            <span>سایر / موارد دیگر</span>
            {otherValue.trim() ? (
              <span className="ms-1 size-1.5 rounded-full bg-emerald-400" />
            ) : null}
          </button>
        </div>

        {isOtherActive ? (
          <div className="relative animate-rise">
            <TextInput
              id={otherInputId}
              value={otherValue}
              placeholder={otherPlaceholder}
              maxLength={200}
              onChange={(e) => onOtherChange(e.target.value)}
              className="pe-9 text-xs"
            />
            {otherValue ? (
              <button
                type="button"
                aria-label="پاک کردن"
                onClick={() => onOtherChange("")}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
