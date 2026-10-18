import tkinter as tk
from tkinter import messagebox
from PIL import Image, ImageTk
import random
import os

class UnoCard:
    def __init__(self, color, value):
        self.color = color
        self.value = value

    def __str__(self):
        return f"{self.color}_{self.value}"

class UnoGame:
    def __init__(self, root):
        self.root = root
        self.root.title("UNO!")
        self.deck = self.create_deck()
        self.player_hand = []
        self.computer_hand = []
        self.discard_pile = []
        self.current_color = None
        self.current_value = None
        self.card_images = self.load_card_images()
        self.create_widgets()
        self.start_game()

    def create_deck(self):
        colors = ["Red", "Yellow", "Green", "Blue"]
        values = list(range(1, 10)) + ["Skip", "Reverse", "Draw Two"]
        deck = [UnoCard(color, value) for color in colors for value in values]
        random.shuffle(deck)
        return deck

    def load_card_images(self):
        card_images = {}
        for filename in os.listdir("cards"):
            if filename.endswith(".png"):
                card_name = filename.split(".")[0]
                image = Image.open(os.path.join("cards", filename))
                card_images[card_name] = ImageTk.PhotoImage(image)
        return card_images

    def draw_card(self, hand):
        if self.deck:
            hand.append(self.deck.pop())
        else:
            self.deck = self.discard_pile[:-1]
            random.shuffle(self.deck)
            self.discard_pile = [self.discard_pile[-1]]
            hand.append(self.deck.pop())

    def start_game(self):
        for _ in range(7):
            self.draw_card(self.player_hand)
            self.draw_card(self.computer_hand)
        self.discard_pile.append(self.deck.pop())
        self.current_color = self.discard_pile[-1].color
        self.current_value = self.discard_pile[-1].value
        self.update_display()

    def create_widgets(self):
        self.player_frame = tk.Frame(self.root)
        self.player_frame.pack(side=tk.BOTTOM)
        self.computer_frame = tk.Frame(self.root)
        self.computer_frame.pack(side=tk.TOP)
        self.discard_pile_label = tk.Label(self.root, text="Discard Pile")
        self.discard_pile_label.pack(side=tk.LEFT)
        self.discard_pile_card = tk.Label(self.root, text="")
        self.discard_pile_card.pack(side=tk.LEFT)
        self.draw_button = tk.Button(self.root, text="Draw Card", command=self.player_draw)
        self.draw_button.pack(side=tk.RIGHT)

    def update_display(self):
        for widget in self.player_frame.winfo_children():
            widget.destroy()
        for card in self.player_hand:
            card_name = str(card)
            button = tk.Button(self.player_frame, image=self.card_images[card_name], command=lambda c=card: self.play_card(c))
            button.pack(side=tk.LEFT)
        discard_card_name = str(self.discard_pile[-1])
        self.discard_pile_card.config(image=self.card_images[discard_card_name])

    def play_card(self, card):
        if card.color == self.current_color or card.value == self.current_value:
            self.player_hand.remove(card)
            self.discard_pile.append(card)
            self.current_color = card.color
            self.current_value = card.value
            self.update_display()
            self.computer_turn()
        else:
            messagebox.showinfo("Invalid Move", "You can't play that card.")

    def player_draw(self):
        self.draw_card(self.player_hand)
        self.update_display()
        self.computer_turn()

    def computer_turn(self):
        valid_cards = [card for card in self.computer_hand if card.color == self.current_color or card.value == self.current_value]
        if valid_cards:
            card = random.choice(valid_cards)
            self.computer_hand.remove(card)
            self.discard_pile.append(card)
            self.current_color = card.color
            self.current_value = card.value
        else:
            self.draw_card(self.computer_hand)
        self.update_display()

if __name__ == "__main__":
    root = tk.Tk()
    game = UnoGame(root)
    root.mainloop()