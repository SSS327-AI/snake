import random
import tkinter as tk


class SnakeGame:
    WIDTH = 600
    HEIGHT = 600
    CELL_SIZE = 20
    SPEED = 120

    DIRECTION_MAP = {
        "Up": (0, -1),
        "Down": (0, 1),
        "Left": (-1, 0),
        "Right": (1, 0),
        "w": (0, -1),
        "s": (0, 1),
        "a": (-1, 0),
        "d": (1, 0),
    }

    def __init__(self, root):
        self.root = root
        self.root.title("Snake")
        self.root.configure(bg="#111111")

        self.canvas = tk.Canvas(
            root,
            width=self.WIDTH,
            height=self.HEIGHT,
            bg="#111111",
            highlightthickness=0,
        )
        self.canvas.pack()

        self.score_var = tk.StringVar(value="Score: 0")
        self.score_label = tk.Label(
            root,
            textvariable=self.score_var,
            bg="#111111",
            fg="#ffffff",
            font=("Arial", 14, "bold"),
        )
        self.score_label.pack(pady=(0, 8))

        self.reset_game()
        self.root.bind("<KeyPress>", self.handle_key)
        self.root.after(self.SPEED, self.tick)

    def reset_game(self):
        self.snake = [(10, 10), (9, 10), (8, 10)]
        self.direction = (1, 0)
        self.next_direction = (1, 0)
        self.food = self.spawn_food()
        self.score = 0
        self.update_score()
        self.draw()

    def spawn_food(self):
        while True:
            candidate = (
                random.randint(0, self.WIDTH // self.CELL_SIZE - 1),
                random.randint(0, self.HEIGHT // self.CELL_SIZE - 1),
            )
            if candidate not in self.snake:
                return candidate

    def update_score(self):
        self.score_var.set(f"Score: {self.score}")

    def handle_key(self, event):
        key = event.keysym
        candidate = self.DIRECTION_MAP.get(key)
        if candidate is None:
            return

        dx, dy = candidate
        if (dx, dy) == (-self.direction[0], -self.direction[1]):
            return
        self.next_direction = candidate

    def tick(self):
        self.direction = self.next_direction
        head_x, head_y = self.snake[0]
        move_x, move_y = self.direction
        next_head = (head_x + move_x, head_y + move_y)

        if (
            next_head[0] < 0
            or next_head[1] < 0
            or next_head[0] >= self.WIDTH // self.CELL_SIZE
            or next_head[1] >= self.HEIGHT // self.CELL_SIZE
            or next_head in self.snake[:-1]
        ):
            self.show_game_over()
            return

        self.snake.insert(0, next_head)
        if next_head == self.food:
            self.score += 1
            self.food = self.spawn_food()
            self.update_score()
        else:
            self.snake.pop()

        self.draw()
        self.root.after(self.SPEED, self.tick)

    def show_game_over(self):
        self.canvas.create_text(
            self.WIDTH // 2,
            self.HEIGHT // 2,
            text=f"Game Over! Final score: {self.score}\nPress R to restart",
            font=("Arial", 20, "bold"),
            fill="#ff4d4d",
            justify="center",
        )
        self.root.bind("<KeyPress-r>", self.restart_game)

    def restart_game(self, event=None):
        self.root.unbind("<KeyPress-r>")
        self.reset_game()
        self.root.after(self.SPEED, self.tick)

    def draw(self):
        self.canvas.delete("all")

        for x in range(0, self.WIDTH, self.CELL_SIZE):
            self.canvas.create_line(x, 0, x, self.HEIGHT, fill="#222222")
        for y in range(0, self.HEIGHT, self.CELL_SIZE):
            self.canvas.create_line(0, y, self.WIDTH, y, fill="#222222")

        for x, y in self.snake:
            self.canvas.create_rectangle(
                x * self.CELL_SIZE,
                y * self.CELL_SIZE,
                (x + 1) * self.CELL_SIZE,
                (y + 1) * self.CELL_SIZE,
                fill="#36d399",
                outline="#1f7a5c",
            )

        food_x, food_y = self.food
        self.canvas.create_rectangle(
            food_x * self.CELL_SIZE,
            food_y * self.CELL_SIZE,
            (food_x + 1) * self.CELL_SIZE,
            (food_y + 1) * self.CELL_SIZE,
            fill="#ff6b6b",
            outline="#b53737",
        )


if __name__ == "__main__":
    root = tk.Tk()
    game = SnakeGame(root)
    root.mainloop()
