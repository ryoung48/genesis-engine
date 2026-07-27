export class Point2D {
	public x: number
	public y: number

	constructor(x: number, y: number) {
		this.x = x
		this.y = y
	}

	subtract(other: Point2D): Point2D {
		return new Point2D(this.x - other.x, this.y - other.y)
	}

	add(other: Point2D): Point2D {
		return new Point2D(this.x + other.x, this.y + other.y)
	}

	multiply(scalar: number): Point2D {
		return new Point2D(this.x * scalar, this.y * scalar)
	}

	get length(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y)
	}

	normalize(): Point2D {
		const len = this.length
		if (len === 0) return new Point2D(0, 0)
		return new Point2D(this.x / len, this.y / len)
	}

	perpendicular(): Point2D {
		return new Point2D(-this.y, this.x)
	}

	equals(other: Point2D): boolean {
		return this.x === other.x && this.y === other.y
	}

	clone(): Point2D {
		return new Point2D(this.x, this.y)
	}
}
