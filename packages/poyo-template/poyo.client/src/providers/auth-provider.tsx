import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { parseJwt } from "~/lib";

interface User {
	username: string;
	// Add other UI claims here as needed (avatar, email, etc.)
}

interface AuthContextType {
	user: User | null;
	isLoading: boolean;
	logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const initAuth = () => {
			const token = localStorage.getItem("ui-token");
			if (!token) {
				setUser(null);
				setIsLoading(false);
				return;
			}

			// Parse Token
			const decoded = parseJwt<{ sub: string; name: string }>(token);

			if (decoded) {
				setUser({
					username: decoded.name || decoded.sub || "User",
				});
			} else {
				// Invalid token format
				setUser(null);
				localStorage.removeItem("ui-token");
			}
			setIsLoading(false);
		};

		initAuth();
	}, []);

	const logout = () => {
		localStorage.removeItem("ui-token");
		setUser(null);
		// Force reload or redirect to ensure clean state
		window.location.href = "/Home";
	};

	return (
		<AuthContext.Provider value={{ user, isLoading, logout }}>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
};
