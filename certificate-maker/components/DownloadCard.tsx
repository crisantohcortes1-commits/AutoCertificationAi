interface DownloadCardProps {
  onReset: () => void;
}

export default function DownloadCard({ onReset }: DownloadCardProps) {
  return (
    <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-green-900 shadow-sm">
      <p className="text-lg font-semibold">Certificates.zip is downloading!</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded-xl bg-green-600 px-4 py-2 text-white hover:bg-green-700"
      >
        Start Over
      </button>
    </div>
  );
}
