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
		<div className="min-h-screen bg-[#F0F9FF] flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				{/* Logo/Title */}
				<div className="text-center mb-8">
					<div className="relative inline-flex items-center justify-center mb-2">
						<h1 className="text-5xl font-black text-[#5ba4fc] tracking-tight drop-shadow-sm">
							poyo<span className="text-pink-400 text-3xl align-top">♥</span>
						</h1>
					</div>
					<p className="text-slate-500 font-medium">Sign in to continue</p>
				</div>

				{/* Login Card */}
				<div className="bg-white rounded-3xl shadow-sm border border-sky-100 p-8 sm:p-10">
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
						{/* Username Field */}
						<div>
							<label
								htmlFor="username"
								className="block text-sm font-bold text-slate-600 mb-2"
							>
								Username
							</label>
							<input
								{...register("username")}
								type="text"
								id="username"
								className="w-full px-4 py-3 border-2 border-sky-100 rounded-2xl focus:ring-4 focus:ring-sky-100 focus:border-[#5ba4fc] outline-none transition-all text-slate-700 bg-sky-50/50"
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
								className="block text-sm font-bold text-slate-600 mb-2"
							>
								Password
							</label>
							<input
								{...register("password")}
								type="password"
								id="password"
								className="w-full px-4 py-3 border-2 border-sky-100 rounded-2xl focus:ring-4 focus:ring-sky-100 focus:border-[#5ba4fc] outline-none transition-all text-slate-700 bg-sky-50/50"
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
								className="w-5 h-5 border-2 border-sky-200 rounded-lg text-[#5ba4fc] focus:ring-[#5ba4fc]"
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
							className="w-full px-4 py-3.5 bg-[#5ba4fc] text-white rounded-2xl hover:bg-[#4a93ed] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold shadow-lg shadow-sky-200 hover:shadow-sky-300 transform hover:-translate-y-0.5 active:translate-y-0 text-lg"
						>
							{isSubmitting ? "Signing in..." : "Sign In"}
						</button>
					</form>

					{/* Demo Credentials */}
					<div className="mt-8 p-5 bg-[#F0F9FF] rounded-2xl border border-sky-100">
						<p className="text-sm text-[#5ba4fc] mb-3 font-bold uppercase tracking-wide opacity-80">
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
					<div className="mt-8 text-center">
						<a
							href="/"
							className="text-sm font-semibold text-slate-400 hover:text-[#5ba4fc] transition-colors"
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
