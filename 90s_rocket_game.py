import pygame
import random
import sys
import json

pygame.init()
pygame.mixer.init()

WIDTH, HEIGHT = 1920, 1080
FPS = 120
ENEMY_DROP_SPEED = 1.8
IS_MUTED = False
PLAYER_SIZE = 100
BULLET_SIZE = 20
ENEMY_SIZE = 100
FRIENDLY_ROCKET_SIZE = 30
ENEMY_ROCKET_SIZE = 30
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Galactic Shooter !!!")

def load_image(path, size=None):
    image = pygame.image.load(path)
    if size:
        image = pygame.transform.scale(image, size)
    return image

explosion_image = load_image(r"c:/Users/Rvkko's computer/Pictures/623cdcca882db2d7efa8d32424a61d29_w200.gif", (50, 50))
player_hit_sound = pygame.mixer.Sound(r"c:/Users/Rvkko's computer/Downloads/retro-explode-2-236688.mp3")
enemy_hit_sound = pygame.mixer.Sound(r"c:/Users/Rvkko's computer/Downloads/retro-explode-1-236678.mp3")
space_background = pygame.image.load(r"c:/Users/Rvkko's computer/Downloads/space-1164579_1920.png")
space_background = pygame.transform.scale(space_background, (WIDTH, HEIGHT))
player_image = load_image(r"c:/Users/Rvkko's computer/Pictures/BAOyZX.png", (PLAYER_SIZE, PLAYER_SIZE))
enemy_image = load_image(r"c:/Users/Rvkko's computer/Pictures/mini1.png", (PLAYER_SIZE, PLAYER_SIZE))
bullet_image = load_image(r"c:/Users/Rvkko's computer/Pictures/66cb7c87c36bc8152d8f80b5.png", (20, 20))

pygame.mixer.music.load(r"c:/Users/Rvkko's computer/Downloads/Megaman 3 Theme.mp3")
pygame.mixer.music.set_volume(0.1)
pygame.mixer.music.play(-1)

bullets = []
enemy_list = []
score = 0
leaderboard = []
font = pygame.font.SysFont("monospace", 35)
retro_font = pygame.font.Font(r"c:/Users/Rvkko's computer/Downloads/videotype.otf", 50)
clock = pygame.time.Clock()

high_scores = {}

def load_high_scores(filename="high_scores.json"):
    global high_scores
    try:
        with open(filename, 'r') as file:
            high_scores = json.load(file)
    except FileNotFoundError:
        high_scores = {}

with open('load_high_score.json', 'r') as file:
    high_scores = json.load(file)
    high_scores_str = "High Scores:\n" + "\n".join([f"{player}: {score}" for player, score in high_scores.items()])

def save_high_scores(filename="high_scores.json"):
    with open(filename, 'w') as file:
        json.dump(high_scores, file)

def update_score(player_name, current_score):
    if player_name in high_scores:
        if current_score > high_scores[player_name]:
            high_scores[player_name] = current_score
    else:
        high_scores[player_name] = current_score

load_high_scores()

player_name = "Player1"
current_score = 0

current_score += 10
update_score(player_name, current_score)

save_high_scores()

class Player:
    def __init__(self, name):
        self.name = name
        self.high_score = 0

    def update_high_score(self, score):
        if score > self.high_score:
            self.high_score = score

    def reset_high_score(self):
        self.high_score = 0

current_player = None

def display_scores(current_score, high_score):
    current_score_text = font.render(f"Current Score: {current_score}", True, (255, 255, 255))
    high_score_text = font.render(f"High Score: {high_score}", True, (255, 255, 255))
    
    screen.blit(current_score_text, (50, 50))
    screen.blit(high_score_text, (50, 100))
    pygame.display.flip()

def drop_enemies(enemy_list):
    if len(enemy_list) < 10:
        enemy_x_pos = random.randint(0, WIDTH - ENEMY_SIZE)
        enemy_list.append([enemy_x_pos, 0])

def player_death():
    global score, current_player
    current_player.update_high_score(score)
    pygame.mixer.music.stop()

def draw_entities(image, positions):
    for pos in positions:
        screen.blit(image, (pos[0], pos[1]))

def update_positions(positions, speed, is_bullet=False):
    for idx, pos in enumerate(positions):
        if is_bullet:
            if pos[1] > 0:
                pos[1] -= 15
            else:
                positions.pop(idx)
        else:
            if pos[1] < HEIGHT:
                pos[1] += speed
            else:
                positions.pop(idx)

def check_collision(list1, list2, size1, size2):
    for item1 in list1:
        rect1 = pygame.Rect(item1[0], item1[1], size1, size1)
        for item2 in list2:
            rect2 = pygame.Rect(item2[0], item2[1], size2, size2)
            if rect1.colliderect(rect2):
                return list1.index(item1), list2.index(item2)
    return None

def welcome_screen():
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()

        screen.fill((20, 20, 30))
        title_font = pygame.font.SysFont("monospace", 100)
        title_text = title_font.render("Welcome To Galactic Shooter !!!", True, WHITE)
        screen.blit(title_text, (WIDTH // 2 - title_text.get_width() // 2, HEIGHT // 2 - 100))

        instructions_font = pygame.font.SysFont("monospace", 50)
        instructions_text = instructions_font.render("Click to Start", True, WHITE)
        screen.blit(instructions_text, (WIDTH // 2 - instructions_text.get_width() // 2, HEIGHT // 2 + 50))

        high_score_font = pygame.font.SysFont("monospace", 50)
        high_score_text = high_score_font.render(high_scores_str, True, WHITE)
        screen.blit(high_score_text, (WIDTH // 2 - high_score_text.get_width() // 2, HEIGHT // 2 + 150))

        pygame.display.flip()
        clock.tick(120)

def login_screen():
    global current_player, score, IS_MUTED
    color_inactive = pygame.Color('lightskyblue3')
    color_active = pygame.Color('cyan')
    background_color = (20, 20, 30)
    neon_purple = pygame.Color('purple')
    
    title_font = pygame.font.SysFont("monospace", 50)
    input_font = pygame.font.Font(r"c:/Users/Rvkko's computer/Downloads/videotype.otf", 35)
    
    input_box = pygame.Rect(WIDTH // 2 - 150, HEIGHT // 2, 300, 60)
    color = color_inactive
    active = False
    text = ''
    clock = pygame.time.Clock()

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()

            if event.type == pygame.MOUSEBUTTONDOWN:
                active = input_box.collidepoint(event.pos)
                color = color_active if active else color_inactive

            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    return welcome_screen()
                if active:
                    if event.key == pygame.K_RETURN:
                        current_player = Player(text)
                        score = 0
                        print(f"Player name captured: {text}")
                        return text
                    elif event.key == pygame.K_BACKSPACE:
                        text = text[:-1]
                    else:
                        text += event.unicode

        screen.fill(background_color)
        title_text = title_font.render("Enter Player Name", True, neon_purple)
        screen.blit(title_text, (WIDTH // 2 - title_text.get_width() // 2, HEIGHT // 2 - 100))

        txt_surface = input_font.render(text, True, color_active)
        input_box.w = max(300, txt_surface.get_width() + 10)
        screen.blit(txt_surface, (input_box.x + 10, input_box.y + 10))
        
        pygame.draw.rect(screen, color, input_box, 4)

        if create_button("Leaderboard", WIDTH // 2 - 125, HEIGHT // 2 + 100, (0, 128, 0), (0, 200, 0)):
            show_leaderboard()

        if create_button("Settings", WIDTH // 2 - 125, HEIGHT // 2 + 170, (128, 128, 128), (200, 200, 200)):
            settings_screen()

        pygame.display.flip()
        clock.tick(120)

def create_button(text, x, y, inactive_color, active_color):
    mouse = pygame.mouse.get_pos()
    click = pygame.mouse.get_pressed()
    button_rect = pygame.Rect(x, y, 250, 50)
    if button_rect.collidepoint(mouse):
        pygame.draw.rect(screen, active_color, button_rect)
        if click[0] == 1:
            return True
    else:
        pygame.draw.rect(screen, inactive_color, button_rect)
    
    button_text = retro_font.render(text, True, WHITE)
    screen.blit(button_text, (x + (250 - button_text.get_width()) // 2, y + (50 - button_text.get_height()) // 2))
    return False

def rebindable_keys_screen():
    global screen, clock, key_bindings
    rebind_active = True
    selected_action = None
    error_message = None
    error_message_timer = 0

    background_color = (20, 20, 30)
    key_bindings = {
        "left": pygame.K_a,
        "right": pygame.K_d,
        "shoot": pygame.K_SPACE,
        "pause": pygame.K_p,
        "quit": pygame.K_ESCAPE
    }

    default_keys = {pygame.K_a, pygame.K_d, pygame.K_SPACE, pygame.K_p, pygame.K_ESCAPE}

    positions = [
        HEIGHT // 2 - 150,
        HEIGHT // 2 - 75,
        HEIGHT // 2,
        HEIGHT // 2 + 75,
        HEIGHT // 2 + 150
    ]

    while rebind_active:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    rebind_active = False
                elif selected_action:
                    # Check if the key is already bound to another action, excluding default keys
                    if event.key not in key_bindings.values() or event.key in default_keys:
                        key_bindings[selected_action] = event.key
                        selected_action = None  # Reset after rebinding
                        error_message = None  # Clear error message
                        error_message_timer = 0  # Reset error message timer
                    else:
                        error_message = "Key already in use. Please choose another key."
                        error_message_timer = pygame.time.get_ticks()  # Set error message timer

        screen.fill(background_color)
        
        # Title Text
        rebind_text = retro_font.render("Key Bindings", True, WHITE)
        screen.blit(rebind_text, (WIDTH // 2 - rebind_text.get_width() // 2, HEIGHT // 2 - 200))

        for i, (action, key) in enumerate(key_bindings.items()):
            # Render the action text
            action_text = retro_font.render(f"{action}: {pygame.key.name(key)}", True, WHITE)
            action_position = (WIDTH // 2 - action_text.get_width() // 2, positions[i])
            screen.blit(action_text, action_position)

            # Check if the rebind button is clicked
            if selected_action != action:
                button_text = f"Rebind {action.capitalize()}"
                button_position = (WIDTH // 2 - 125, positions[i] + 30)
                button_color = (128, 128, 128)
                button_hover_color = (200, 200, 200)
            if create_button(button_text, button_position[0], button_position[1], button_color, button_hover_color):
                selected_action = action



        # Display error message if any
        if error_message:
            error_text = retro_font.render(error_message, True, (255, 0, 0))
            screen.blit(error_text, (WIDTH // 2 - error_text.get_width() // 2, HEIGHT // 2 + 200))
            if pygame.time.get_ticks() - error_message_timer > 2000:  # Display error for 2 seconds
                error_message = None

        # Update the display and tick the clock
        pygame.display.flip()
        clock.tick(120)

def settings_screen():
    global IS_MUTED
    settings_active = True

    while settings_active:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    settings_active = False

        screen.fill((20, 20, 30))

        titltext = retro_font.render("Settings", True, WHITE)
        screen.blit(titltext, (WIDTH // 2 - titltext.get_width() // 2, HEIGHT // 2 - 200))
        
        if create_button("Rebind Keys", WIDTH // 2 - 125, HEIGHT // 2 - 50, (128, 128, 128), (200, 200, 200)):
            rebindable_keys_screen()

        mute_button_text = "Unmute" if IS_MUTED else "Mute"
        if create_button(mute_button_text, WIDTH // 2 - 125, HEIGHT // 2 + 20, (128, 128, 128), (200, 200, 200)):
            IS_MUTED = not IS_MUTED
            if IS_MUTED:
                pygame.mixer.music.pause()
                pygame.mixer.pause()
                player_hit_sound.set_volume(0)
                enemy_hit_sound.set_volume(0)
            else:
                pygame.mixer.music.unpause()
                pygame.mixer.unpause()
                player_hit_sound.set_volume(1)
                enemy_hit_sound.set_volume(1)

        pygame.display.flip()
        clock.tick(120)

def start_game():
    player_name = input("Enter your name: ")
    print(f"Player name entered: {player_name}")
    main_game(player_name)

def pause_game():
    global IS_MUTED
    paused = True
    pause_text = retro_font.render("Game Paused. Press 'R' to Restart.", True, WHITE)
    while paused:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_r:
                    initialize_game()
                    paused = False
                if event.key == pygame.K_m:
                    IS_MUTED = not IS_MUTED
                    if IS_MUTED:
                        pygame.mixer.music.pause()
                        pygame.mixer.pause()
                    else:
                        pygame.mixer.music.unpause()
                        pygame.mixer.unpause()

        screen.fill((0, 0, 0))
        screen.blit(pause_text, (WIDTH // 2 - pause_text.get_width() // 2, HEIGHT // 2 - pause_text.get_height() // 2))
        pygame.display.flip()
        clock.tick(120)

def show_leaderboard():
    global leaderboard, high_score, current_player, screen, WIDTH
    high_score = current_player.high_score if current_player else 0
    if current_player is None:
        print("Error: current_player is None")
        return
    if high_scores is None:
        print("Error: high_scores is None")
        return

    if high_score is not None:
        print(f"High Score: {high_score}")
    else:
        print("Error: high_score is None")

    player_found = False

    for entry in leaderboard:
        if entry["name"] == current_player.name:
            player_found = True
            if entry["score"] < high_score:
                entry["score"] = high_score
            break

    if not player_found:
        leaderboard.append({"name": current_player.name, "score": high_score})

    seen_names = set()
    unique_leaderboard = []
    for entry in leaderboard:
        if entry["name"] not in seen_names:
            unique_leaderboard.append(entry)
            seen_names.add(entry["name"])

    leaderboard = unique_leaderboard

    leaderboard = sorted(leaderboard, key=lambda x: x["score"], reverse=True)

    background_color = (20, 20, 30)
    screen.fill(background_color)
    title_font = pygame.font.SysFont("monospace", 50)
    leaderboard_font = pygame.font.SysFont("monospace", 35)
    title_text = title_font.render("Leaderboard", True, (0, 255, 255))
    screen.blit(title_text, (WIDTH // 2 - title_text.get_width() // 2, 50))

    for idx, entry in enumerate(leaderboard):
        entry_text = leaderboard_font.render(f"{idx + 1}. {entry['name']} - {entry['score']}", True, pygame.Color('white'))
        screen.blit(entry_text, (WIDTH // 2 - entry_text.get_width() // 2, 150 + idx * 40))

    pygame.display.flip()
    waiting = True
    while waiting:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                waiting = False

def handle_events():
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        if event.type == pygame.KEYDOWN and event.key == pygame.K_p:
            pause_game()

def draw_game(player_name, player_pos, power_up_bar, score, current_player):
    screen.blit(space_background, (0, 0))
    name_text = retro_font.render(f"Player: {player_name}", True, WHITE)
    screen.blit(name_text, (WIDTH - name_text.get_width() - 10, 10))
    score_text = retro_font.render(f"Score: {score}", True, WHITE)
    screen.blit(score_text, (10, 10))
    high_score_text = retro_font.render(f"High Score: {current_player.high_score}", True, WHITE)
    screen.blit(high_score_text, (10, 50))
    pygame.draw.rect(screen, (255, 215, 0), (10, 90, power_up_bar, 20))
    screen.blit(player_image, (player_pos[0], player_pos[1]))
    draw_entities(enemy_image, enemy_list)
    draw_entities(bullet_image, bullets)
    pygame.display.flip()

def initialize_game():
    global player, score, high_score, enemies, bullets, power_ups
    player = Player()
    score = 0
    high_score = 0
    enemies = []
    bullets = []
    power_ups = []

def main_game(player_name):
    global score, high_score, enemy_list, bullets, leaderboard, current_player
    score = 0
    game_over = False
    player_pos = [WIDTH // 2, HEIGHT - PLAYER_SIZE]
    bullets = []
    enemy_list = []
    last_shot_time = 0
    power_up_active = False
    player_health = 1
    power_up_bar = 0
    kills = 0
    rapid_fire_active = False
    rapid_fire_start_time = 0
    bullet_count = 1

    if current_player is None:
        current_player = Player(player_name)

    print(f"Starting game with player: {player_name}")

    if not pygame.mixer.music.get_busy() and not IS_MUTED:
        pygame.mixer.music.play(-1)    

    while True:
        handle_events()

        keys = pygame.key.get_pressed()
        if keys[pygame.K_a] and player_pos[0] > 0:
            player_pos[0] -= 5
        if keys[pygame.K_d] and player_pos[0] < WIDTH - PLAYER_SIZE:
            player_pos[0] += 5

        if keys[pygame.K_LEFT] and player_pos[0] > 0:
            player_pos[0] -= 5
        if keys[pygame.K_RIGHT] and player_pos[0] < WIDTH - PLAYER_SIZE:
            player_pos[0] += 5

        current_time = pygame.time.get_ticks()
        if keys[pygame.K_SPACE] and current_time - last_shot_time >= (100 if rapid_fire_active else 500):
            if len(bullets) < 4:
                for _ in range(bullet_count):
                    bullets.append([player_pos[0] + PLAYER_SIZE // 2 - 10, player_pos[1]])
                last_shot_time = current_time

        drop_enemies(enemy_list)
        update_positions(enemy_list, ENEMY_DROP_SPEED)
        update_positions(bullets, 15, is_bullet=True)

        if score > 0 and score % 10 == 0 and not power_up_active:
            power_up_active = True
            player_health = 2
            power_up_bar = 100

        if power_up_active:
            power_up_bar -= 0.08
            if power_up_bar <= 0:
                power_up_active = False
                player_health = 1
                power_up_bar = 0

        collision = check_collision(enemy_list, [player_pos], ENEMY_SIZE, PLAYER_SIZE)
        if collision:
            if player_health > 1:
                player_health -= 1
                power_up_active = False
                del enemy_list[collision[0]]
            else:
                player_hit_sound.play()
                game_over = True
                player_death()

        if check_collision(bullets, enemy_list, BULLET_SIZE, ENEMY_SIZE):
            bullet_idx, enemy_idx = check_collision(bullets, enemy_list, BULLET_SIZE, ENEMY_SIZE)
            del bullets[bullet_idx]
            del enemy_list[enemy_idx]
            score += 1
            kills += 1
            enemy_hit_sound.play()

        if kills >= 20 and not rapid_fire_active:
            rapid_fire_active = True
            rapid_fire_start_time = pygame.time.get_ticks()

        if power_up_active:
            power_up_bar = min(100, power_up_bar + 0.5)

        if score == 10:
            bullet_count = 2

        if rapid_fire_active and pygame.time.get_ticks() - rapid_fire_start_time >= 10000:
            rapid_fire_active = False
            kills = 0

        if game_over:
            if score > current_player.high_score:
                current_player.high_score = score

            leaderboard.append({"name": player_name, "score": score})
            leaderboard = sorted(leaderboard, key=lambda x: x["score"], reverse=True)[:5]

            retro_font_large = pygame.font.SysFont("monospace", 50)
            screen.blit(space_background, (0, 0))
            screen.blit(explosion_image, (player_pos[0], player_pos[1]))
            game_over_text = retro_font_large.render("Game Over!", True, WHITE)
            score_text = retro_font_large.render(f"Final Score: {score}", True, WHITE)
            high_score_txt = retro_font_large.render(f"High Score: {current_player.high_score}", True, WHITE)
            exit_text = retro_font_large.render("Press ESC to Quit", True, WHITE)

            center_x = WIDTH // 2
            game_over_text_rect = game_over_text.get_rect(center=(center_x, HEIGHT // 2 - 100))
            score_text_rect = score_text.get_rect(center=(center_x, HEIGHT // 2 - 50))
            high_score_text_rect = high_score_txt.get_rect(center=(center_x, HEIGHT // 2))
            exit_text_rect = exit_text.get_rect(center=(center_x, HEIGHT // 2 + 50))

            screen.blit(game_over_text, game_over_text_rect)
            screen.blit(score_text, score_text_rect)
            screen.blit(high_score_txt, high_score_text_rect)
            screen.blit(exit_text, exit_text_rect)

        while game_over:
            pygame.display.update()

            if create_button("Restart Game", WIDTH // 2 - 125, HEIGHT // 2 + 100, (0, 128, 0), (0, 200, 0)):
                main_game(player_name)

            if create_button("Change Name", WIDTH // 2 - 125, HEIGHT // 2 + 170, (128, 0, 0), (200, 0, 0)):
                high_score = 0
                return "login_screen"

            if pygame.key.get_pressed()[pygame.K_ESCAPE]:
                pygame.quit()
                sys.exit()

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()

            clock.tick(FPS)

        draw_game(player_name, player_pos, power_up_bar, score, current_player)

def main():
    while True:
        welcome_screen()
        
        player_name = login_screen()
        
        while player_name:
            result = main_game(player_name)
            
            if result == "login_page":
                player_name = login_screen()
            elif result == "change_name":
                player_name = login_screen()
            else:
                break

        clock.tick(120)
        pygame.display.flip()

if __name__ == "__main__":
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT), pygame.DOUBLEBUF)
    clock = pygame.time.Clock()
    retro_font = pygame.font.SysFont("monospace", 30)

    pygame.mixer.music.load("c:/Users/Rvkko's computer/Downloads/Megaman 3 Theme.mp3")
    pygame.mixer.music.play(-1)

    main()
    pygame.quit()
    sys.exit()

    print("Thank you for playing!")
