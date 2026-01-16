import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLogin } from "~/hooks-api/auth";
import { isHttpError } from "~/lib/http";
import { schemas } from "~/schemas/validations.generated";

type LoginFormData = z.infer<typeof schemas.LoginRequest>;

export default function LoginPage() {
	const loginMutation = useLogin();

	const {
		register,
		handleSubmit,
		setError: setFormError,
		formState: { errors, isSubmitting },
	} = useForm<LoginFormData>({
		resolver: zodResolver(schemas.LoginRequest),
		defaultValues: {
			username: "",
			password: "",
			rememberMe: false,
		},
	});

	const onSubmit = async (data: LoginFormData) => {
		try {
			const response = await loginMutation.mutateAsync({
				username: data.username,
				password: data.password,
				appType: "web",
			});

			if (response.status === "success") {
				window.location.href = "/Dashboard";
			} else {
				const msg = response.message || "Invalid credentials";

				if (response.status === "fail") {
					setFormError("password", {
						type: "manual",
						message: msg,
					});
				}
			}
		} catch (err: unknown) {
			console.error("Login failed", err);

			let message = "Invalid credentials. Try demo/password";

			if (isHttpError<{ message: string }>(err) && err.data?.message) {
				message = err.data.message;
			}

			setFormError("password", {
				type: "manual",
				message: message,
			});
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				{/* Logo/Title */}
				<div className="text-center mb-8">
					<h1 className="text-4xl font-bold text-slate-900 mb-2">Poyo</h1>
					<p className="text-slate-600">Sign in to continue</p>
				</div>

				{/* Login Card */}
				<div className="bg-white rounded-lg shadow-lg border border-slate-200 p-8">
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
						{/* Username Field */}
						<div>
							<label
								htmlFor="username"
								className="block text-sm font-medium text-slate-700 mb-2"
							>
								Username
							</label>
							<input
								{...register("username")}
								type="text"
								id="username"
								className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
								placeholder="demo"
							/>
							{errors.username && (
								<p className="mt-1 text-sm text-red-600">
									{errors.username.message}
								</p>
							)}
						</div>

						{/* Password Field */}
						<div>
							<label
								htmlFor="password"
								className="block text-sm font-medium text-slate-700 mb-2"
							>
								Password
							</label>
							<input
								{...register("password")}
								type="password"
								id="password"
								className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
								placeholder="password"
							/>
							{errors.password && (
								<p className="mt-1 text-sm text-red-600">
									{errors.password.message}
								</p>
							)}
						</div>

						{/* Remember Me */}
						<div className="flex items-center">
							<input
								{...register("rememberMe")}
								type="checkbox"
								id="rememberMe"
								className="w-4 h-4 border-slate-300 rounded text-slate-900 focus:ring-slate-900"
							/>
							<label
								htmlFor="rememberMe"
								className="ml-2 text-sm text-slate-700"
							>
								Remember me
							</label>
						</div>

						{/* Submit Button */}
						<button
							type="submit"
							disabled={isSubmitting}
							className="w-full px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
						>
							{isSubmitting ? "Signing in..." : "Sign In"}
						</button>
					</form>

					{/* Demo Credentials */}
					<div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
						<p className="text-sm text-slate-600 mb-2 font-medium">
							Demo Credentials:
						</p>
						<p className="text-sm text-slate-700">
							Username:{" "}
							<code className="font-mono bg-white px-2 py-1 rounded">demo</code>
						</p>
						<p className="text-sm text-slate-700">
							Password:{" "}
							<code className="font-mono bg-white px-2 py-1 rounded">
								password
							</code>
						</p>
					</div>

					{/* Back to Home */}
					<div className="mt-6 text-center">
						<a
							href="/"
							className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
						>
							← Back to Home
						</a>
					</div>
				</div>

				{/* Features Note */}
				<div className="mt-6 text-center text-sm text-slate-600">
					<p>This demo showcases:</p>
					<p className="font-medium text-slate-700">
						React Hook Form + Zod validation + TanStack Query
					</p>
				</div>
			</div>
		</div>
	);
}
