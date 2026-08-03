import poyoLogo from "~/assets/poyo.png";

export default function HomePage() {
	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F9FF] text-slate-700 font-sans selection:bg-[#5ba4fc] selection:text-white">
			{/* Content Container */}
			<div className="max-w-4xl w-full px-6 py-16 text-center">
				{/* Logo / Title */}
				{/* Logo / Title */}
				<div className="relative inline-flex items-center justify-center mb-6">
					<img
						src={poyoLogo}
						alt="Poyo"
						className="absolute -left-[140px] -top-[60px] w-[240px] max-w-[none] z-10"
					/>
					<h1 className="text-7xl font-black tracking-tight text-[#5ba4fc] drop-shadow-sm">
						poyo<span className="text-pink-400 text-5xl align-top">♥</span>
					</h1>
				</div>
				<p className="text-2xl text-slate-500 mb-12 max-w-2xl mx-auto font-medium">
					A minimal <span className="font-bold text-[#5ba4fc]">React</span> +{" "}
					<span className="font-bold text-[#5ba4fc]">.NET 10</span> MPA starter
					framework.
				</p>

				{/* Primary Actions */}
				<div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
					<a
						href="/Login"
						className="inline-flex items-center justify-center px-10 py-4 rounded-2xl bg-[#5ba4fc] text-white font-bold hover:bg-[#4a93ed] transition-all shadow-lg shadow-sky-200 hover:shadow-sky-300 hover:-translate-y-1"
					>
						Try Demo Login
					</a>
					<a
						href="https://github.com/rubichandrap/PowerApproval"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center justify-center px-10 py-4 rounded-2xl border-2 border-sky-100 bg-white text-slate-600 font-bold hover:border-[#5ba4fc] hover:text-[#5ba4fc] transition-all hover:-translate-y-1"
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
							className="p-8 bg-white rounded-3xl border border-sky-50 shadow-sm hover:shadow-xl hover:shadow-sky-100 transition-all hover:-translate-y-1"
						>
							<div className="text-3xl mb-4">{f.icon}</div>
							<h3 className="font-bold text-slate-800 mb-2 text-lg">
								{f.title}
							</h3>
							<p className="text-slate-500 leading-relaxed">{f.desc}</p>
						</div>
					))}
				</div>

				{/* Built With */}
				<div className="border-t border-sky-100 pt-16">
					<p className="text-sm text-slate-400 font-bold mb-6 uppercase tracking-wider">
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
								className="px-4 py-2 bg-white border border-sky-100 rounded-full text-sm font-semibold text-slate-500 shadow-sm"
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
