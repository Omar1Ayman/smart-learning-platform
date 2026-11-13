export default function Loading() {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Navbar Skeleton */}
      <div className="h-16 border-b border-line bg-paper-elevated/50 flex items-center px-6">
        <div className="w-32 h-8 bg-paper-muted rounded-lg animate-pulse" />
        <div className="ml-auto flex gap-4">
          <div className="w-20 h-8 bg-paper-muted rounded-lg animate-pulse hidden sm:block" />
          <div className="w-24 h-8 bg-paper-muted rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-12">
        <div className="w-3/4 max-w-2xl h-12 bg-paper-muted rounded-xl animate-pulse mb-6" />
        <div className="w-full max-w-xl h-4 bg-paper-muted rounded-lg animate-pulse mb-10" />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-paper-muted rounded-2xl animate-pulse border border-line" />
          ))}
        </div>
      </div>
    </div>
  );
}