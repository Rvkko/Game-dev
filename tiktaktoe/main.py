import tkinter as tk
from tkinter import messagebox

class TicTacToe:
    def __init__(self, root):
        self.root = root
        self.root.title("Tic-Tac-Toe")
        self.current_player = "X"
        self.board = [[" " for _ in range(3)] for _ in range(3)]
        self.buttons = [[None for _ in range(3)] for _ in range(3)]
        self.create_board()
        self.is_player_turn = True  # Flag to control turn timing

    def create_board(self):
        for row in range(3):
            for col in range(3):
                button = tk.Button(self.root, text=" ", font=('normal', 40), width=5, height=2,
                                   command=lambda r=row, c=col: self.on_button_click(r, c))
                button.grid(row=row, column=col)
                self.buttons[row][col] = button

    def on_button_click(self, row, col):
        if self.is_player_turn and self.board[row][col] == " ":
            self.board[row][col] = self.current_player
            self.buttons[row][col].config(text=self.current_player)
            if self.check_win(self.current_player):
                messagebox.showinfo("Tic-Tac-Toe", f"Player {self.current_player} wins!")
                self.reset_board()
            elif all(cell != " " for row in self.board for cell in row):
                messagebox.showinfo("Tic-Tac-Toe", "It's a tie!")
                self.reset_board()
            else:
                self.current_player = "O"
                self.is_player_turn = False
                self.root.after(1000, self.ai_move)  # Delay AI move by 1 second

    def ai_move(self):
        best_score = float('-inf')
        best_move = None
        for row in range(3):
            for col in range(3):
                if self.board[row][col] == " ":
                    self.board[row][col] = "O"
                    score = self.minimax(self.board, 0, False, float('-inf'), float('inf'))
                    self.board[row][col] = " "
                    if score > best_score:
                        best_score = score
                        best_move = (row, col)
        if best_move:
            self.board[best_move[0]][best_move[1]] = "O"
            self.buttons[best_move[0]][best_move[1]].config(text="O")
            if self.check_win("O"):
                messagebox.showinfo("Tic-Tac-Toe", "AI wins!")
                self.reset_board()
            elif all(cell != " " for row in self.board for cell in row):
                messagebox.showinfo("Tic-Tac-Toe", "It's a tie!")
                self.reset_board()
            else:
                self.current_player = "X"
                self.is_player_turn = True

    def minimax(self, board, depth, is_maximizing, alpha, beta):
        if self.check_win("O"):
            return 1
        elif self.check_win("X"):
            return -1
        elif all(cell != " " for row in board for cell in row):
            return 0

        if is_maximizing:
            best_score = float('-inf')
            for row in range(3):
                for col in range(3):
                    if board[row][col] == " ":
                        board[row][col] = "O"
                        score = self.minimax(board, depth + 1, False, alpha, beta)
                        board[row][col] = " "
                        best_score = max(score, best_score)
                        alpha = max(alpha, score)
                        if beta <= alpha:
                            break
            return best_score
        else:
            best_score = float('inf')
            for row in range(3):
                for col in range(3):
                    if board[row][col] == " ":
                        board[row][col] = "X"
                        score = self.minimax(board, depth + 1, True, alpha, beta)
                        board[row][col] = " "
                        best_score = min(score, best_score)
                        beta = min(beta, score)
                        if beta <= alpha:
                            break
            return best_score

    def check_win(self, player):
        for row in self.board:
            if all(cell == player for cell in row):
                return True
        for col in range(3):
            if all(self.board[row][col] == player for row in range(3)):
                return True
        if all(self.board[i][i] == player for i in range(3)) or all(self.board[i][2 - i] == player for i in range(3)):
            return True
        return False

    def reset_board(self):
        self.board = [[" " for _ in range(3)] for _ in range(3)]
        for row in range(3):
            for col in range(3):
                self.buttons[row][col].config(text=" ")
        self.current_player = "X"
        self.is_player_turn = True

if __name__ == "__main__":
    root = tk.Tk()
    game = TicTacToe(root)
    root.mainloop()