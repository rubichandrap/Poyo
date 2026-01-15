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
		<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
			<div className="container mx-auto px-4 py-16">
				{/* Header */}
				<div className="flex justify-between items-center mb-12">
					<div>
						<h1 className="text-4xl font-bold text-slate-900 mb-2">
							Dashboard
						</h1>
						<p className="text-slate-600">Welcome to the protected area!</p>
					</div>
					<button
						type="button"
						onClick={handleLogout}
						className="px-6 py-2 border-2 border-slate-900 text-slate-900 rounded-lg hover:bg-slate-900 hover:text-white transition-colors"
					>
						Logout
					</button>
				</div>

				{/* Server Data Demo */}
				<div className="grid md:grid-cols-2 gap-8 mb-12">
					<div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
						<h2 className="text-2xl font-bold text-slate-900 mb-4">
							🎯 Server Data Demo
						</h2>
						<p className="text-slate-600 mb-4">
							This data was injected from the server using the{" "}
							<code className="bg-slate-100 px-2 py-1 rounded text-sm">
								[ServerData]
							</code>{" "}
							attribute and accessed via{" "}
							<code className="bg-slate-100 px-2 py-1 rounded text-sm">
								usePage()
							</code>{" "}
							hook:
						</p>
						<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
							<pre className="text-sm text-slate-700 overflow-auto">
								{JSON.stringify(serverData, null, 2)}
							</pre>
						</div>
					</div>

					<div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
						<h2 className="text-2xl font-bold text-slate-900 mb-4">
							✅ Protected Route
						</h2>
						<p className="text-slate-600 mb-4">
							This page is protected by the{" "}
							<code className="bg-slate-100 px-2 py-1 rounded text-sm">
								[Authorize]
							</code>{" "}
							attribute. Only authenticated users can access it.
						</p>
						<ul className="space-y-2 text-slate-700">
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
				<div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
					<h2 className="text-2xl font-bold text-slate-900 mb-4">
						🚀 What You Get with Poyo
					</h2>
					<div className="grid md:grid-cols-2 gap-4">
						<div>
							<h3 className="font-bold text-slate-900 mb-2">Server</h3>
							<ul className="space-y-1 text-sm text-slate-600">
								<li>• .NET 10 with minimal API</li>
								<li>• Cookie authentication</li>
								<li>• MVC routing</li>
								<li>• Server data injection</li>
								<li>• GuestOnly attribute</li>
							</ul>
						</div>
						<div>
							<h3 className="font-bold text-slate-900 mb-2">Client</h3>
							<ul className="space-y-1 text-sm text-slate-600">
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
