"use client";

interface TemplateSelectorProps {
  activeSlot: "template1" | "template2" | null;
  onSelect: (slot: "template1" | "template2") => void;
  isLoading: boolean;
}

export default function TemplateSelector({ activeSlot, onSelect, isLoading }: TemplateSelectorProps) {
  const slots: Array<{
    slot: "template1" | "template2";
    icon: string;
    title: string;
    description: string;
    badgeText: string;
    badgeClassName: string;
  }> = [
    {
      slot: "template1",
      icon: "description",
      title: "Template 1 — Landscape",
      description: "Wide format, horizontal layout",
      badgeText: "Landscape",
      badgeClassName: "bg-blue-100 text-blue-700",
    },
    {
      slot: "template2",
      icon: "article",
      title: "Template 2 — Portrait",
      description: "Standard page, vertical layout",
      badgeText: "Portrait",
      badgeClassName: "bg-violet-100 text-violet-700",
    },
  ];

  return (
    <div className={isLoading ? "pointer-events-none opacity-60" : ""}>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((item) => {
          const isActive = activeSlot === item.slot;
          return (
            <button
              key={item.slot}
              type="button"
              className={`relative cursor-pointer rounded-2xl border-2 p-4 text-left transition-all duration-150 hover:border-blue-400 hover:shadow-md bg-white ${
                isActive ? "border-blue-600 shadow-lg ring-2 ring-blue-200" : "border-slate-200"
              }`}
              onClick={() => {
                if (!isLoading) {
                  onSelect(item.slot);
                }
              }}
            >
              <div className="mb-4 flex h-20 items-center justify-center rounded-2xl bg-slate-100">
                <span className="material-symbols-outlined text-4xl text-slate-700">{item.icon}</span>
                <span className={`absolute bottom-3 right-3 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${item.badgeClassName}`}>
                  {item.badgeText}
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-slate-800">{item.title}</h3>
                <p className="text-xs text-slate-500">{item.description}</p>
              </div>
              {isActive && (
                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                  {isLoading ? (
                    <span className="material-symbols-outlined animate-spin text-sm text-blue-600">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-sm">check</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
