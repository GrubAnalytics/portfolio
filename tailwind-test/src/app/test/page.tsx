export default function TestPage() {
  return (
    <>
      <div className="test-tailwind">If this is green, Tailwind works</div>
      <div className="test-tailwind-2">If this is green, Tailwind works</div>
      {/* Hidden reference for Tailwind's JIT */}
      <div className="hidden bg-green-500 text-white"></div>
    </>
  );
}
