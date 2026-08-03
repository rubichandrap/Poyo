import { usePage } from "~/hooks";
import { useLogout } from "~/hooks-api/auth";

interface DashboardData {
	message: string;
	timestamp: string;
	user: string;
}

export default function DashboardPage() {
	const serverData = usePage<DashboardData>();
	const logoutMutation = useLogout();

	const handleLogout = async () => {
		try {
			await logoutMutation.mutateAsync();
			window.location.href = "/";
		} catch (err) {
			console.error("Logout failed", err);
		}
	};

	return (
		<div className="min-h-screen bg-[#F0F9FF]">
			<div className="container mx-auto px-4 py-16">
				{/* Header */}
				<div className="flex justify-between items-center mb-12">
					<div>
						<h1 className="text-4xl font-black text-[#5ba4fc] mb-2 tracking-tight drop-shadow-sm">
							Dashboard
						</h1>
						<p className="text-slate-500 font-medium">
							Welcome to the protected area!{" "}
							<span className="text-pink-400">♥</span>
						</p>
					</div>
					<button
						type="button"
						onClick={handleLogout}
						className="px-6 py-2 border-2 border-[#5ba4fc] text-[#5ba4fc] rounded-2xl font-bold hover:bg-[#5ba4fc] hover:text-white transition-all shadow-sm hover:shadow-md"
					>
						Logout
					</button>
				</div>

				{/* Server Data Demo */}
				<div className="grid md:grid-cols-2 gap-8 mb-12">
					<div className="bg-white rounded-3xl shadow-sm border border-sky-100 p-8">
						<h2 className="text-2xl font-bold text-slate-700 mb-4 flex items-center gap-2">
							<span className="text-2xl">🎯</span> Server Data Demo
						</h2>
						<p className="text-slate-500 mb-4">
							This data was injected from the server using the{" "}
							<code className="bg-sky-50 text-[#5ba4fc] px-2 py-1 rounded-lg text-sm font-bold">
								[ServerData]
							</code>{" "}
							attribute and accessed via{" "}
							<code className="bg-sky-50 text-[#5ba4fc] px-2 py-1 rounded-lg text-sm font-bold">
								usePage()
							</code>{" "}
							hook:
						</p>
						<div className="bg-[#F0F9FF] rounded-2xl p-6 border border-sky-100">
							<pre className="text-sm text-slate-600 overflow-auto font-mono">
								{JSON.stringify(serverData, null, 2)}
							</pre>
						</div>
					</div>

					<div className="bg-white rounded-3xl shadow-sm border border-sky-100 p-8">
						<h2 className="text-2xl font-bold text-slate-700 mb-4 flex items-center gap-2">
							<span className="text-2xl">✅</span> Protected Route
						</h2>
						<p className="text-slate-500 mb-4">
							This page is protected by the{" "}
							<code className="bg-sky-50 text-[#5ba4fc] px-2 py-1 rounded-lg text-sm font-bold">
								[Authorize]
							</code>{" "}
							attribute. Only authenticated users can access it.
						</p>
						<ul className="space-y-3 text-slate-600">
							<li className="flex items-start gap-2">
								<span className="text-green-600">✓</span>
								<span>Cookie-based authentication</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-green-600">✓</span>
								<span>Server-side session management</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-green-600">✓</span>
								<span>Automatic redirect to login</span>
							</li>
						</ul>
					</div>
				</div>

				{/* Framework Features */}
				<div className="bg-white rounded-3xl shadow-sm border border-sky-100 p-8">
					<h2 className="text-2xl font-bold text-slate-700 mb-6 flex items-center gap-2">
						<span className="text-2xl">🚀</span> What You Get with Poyo
					</h2>
					<div className="grid md:grid-cols-2 gap-8">
						<div>
							<h3 className="font-bold text-[#5ba4fc] mb-3 text-lg">
								Server Side
							</h3>
							<ul className="space-y-2 text-sm text-slate-500">
								<li>• .NET 10 with minimal API</li>
								<li>• Cookie authentication</li>
								<li>• MVC routing</li>
								<li>• Server data injection</li>
								<li>• GuestOnly attribute</li>
							</ul>
						</div>
						<div>
							<h3 className="font-bold text-[#5ba4fc] mb-3 text-lg">
								Client Side
							</h3>
							<ul className="space-y-2 text-sm text-slate-500">
								<li>• React 19 with TypeScript</li>
								<li>• TanStack Query for data fetching</li>
								<li>• React Hook Form + Zod validation</li>
								<li>• Tailwind CSS v4</li>
								<li>• Route management CLI</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
