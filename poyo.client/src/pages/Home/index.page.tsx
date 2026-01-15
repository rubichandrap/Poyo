export default function HomePage() {
	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900 font-sans">
			{/* Content Container */}
			<div className="max-w-4xl w-full px-6 py-16 text-center">
				{/* Logo / Title */}
				<h1 className="text-6xl font-extrabold tracking-tight mb-4 text-gray-900">
					Poyo
				</h1>
				<p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
					A minimal <span className="font-semibold text-gray-800">React</span> +{" "}
					<span className="font-semibold text-gray-800">.NET 10</span> MPA
					starter framework.
				</p>

				{/* Primary Actions */}
				<div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
					<a
						href="/Login"
						className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200"
					>
						Try Demo Login
					</a>
					<a
						href="https://github.com/rubichandrap/PowerApproval"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center justify-center px-8 py-3 rounded-lg border-2 border-gray-200 bg-white text-gray-900 font-medium hover:border-gray-300 hover:bg-gray-50 transition-colors"
					>
						View on GitHub
					</a>
				</div>

				{/* Features Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left mb-16">
					{[
						{
							icon: "🚀",
							title: "Multi-Page",
							desc: "Server-side routing with React hydration",
						},
						{
							icon: "🔐",
							title: "Simple Auth",
							desc: "Cookie-based auth demo included",
						},
						{
							icon: "📦",
							title: "Server Data",
							desc: "Inject data without API calls",
						},
						{
							icon: "✨",
							title: "Modern Stack",
							desc: "React 19, TypeScript, Tailwind v4",
						},
						{
							icon: "🎯",
							title: "Type-Safe",
							desc: "Auto-generated types from OpenAPI",
						},
						{
							icon: "🛠️",
							title: "Tooling",
							desc: "CLI for route management",
						},
					].map((f) => (
						<div
							key={f.title}
							className="p-6 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
						>
							<div className="text-2xl mb-3">{f.icon}</div>
							<h3 className="font-bold text-gray-900 mb-1">{f.title}</h3>
							<p className="text-sm text-gray-500">{f.desc}</p>
						</div>
					))}
				</div>

				{/* Built With */}
				<div className="border-t border-gray-200 pt-10">
					<p className="text-sm text-gray-400 font-medium mb-4 uppercase tracking-wider">
						Built With
					</p>
					<div className="flex flex-wrap justify-center gap-3">
						{[
							"React 19",
							".NET 10",
							"TypeScript",
							"Tailwind CSS",
							"Vite",
							"TanStack Query",
						].map((tech) => (
							<span
								key={tech}
								className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600"
							>
								{tech}
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
