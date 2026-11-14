/** Screen title bar. Sans 22/28 semibold per §4.3; optional right-hand slot (e.g. settings). */
export default function TopBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/95 px-4 backdrop-blur">
      <h1 className="text-[22px] font-semibold leading-7">{title}</h1>
      {right}
    </header>
  );
}
