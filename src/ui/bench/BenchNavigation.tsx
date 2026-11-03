import { Link, NavLink } from "react-router-dom"
import { APP_PATHS } from "@/app-routes"
import { cx } from "@/ui/components/lib"
import { uiTokens } from "@/ui/components/tokens"
export function BenchNavigation() {
	return (
		<nav
			aria-label="Bench pages"
			className={cx(uiTokens.bench.navigation, uiTokens.type.control)}
		>
			<NavLink
				to={APP_PATHS.bench}
				className={({ isActive }) =>
					cx(
						uiTokens.bench.navLink,
						isActive ? uiTokens.text.primary : uiTokens.text.muted,
					)
				}
			>
				History bench
			</NavLink>
			<NavLink
				to={APP_PATHS.weatherBench}
				className={({ isActive }) =>
					cx(
						uiTokens.bench.navLink,
						isActive ? uiTokens.text.primary : uiTokens.text.muted,
					)
				}
			>
				Weather bench
			</NavLink>
			<Link
				to={APP_PATHS.tectonicLab}
				className={cx(uiTokens.bench.navLink, uiTokens.text.muted)}
			>
				World
			</Link>
		</nav>
	)
}
