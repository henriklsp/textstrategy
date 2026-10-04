import { GameLoop } from './GameLoop';
import { UI } from './UI';

// Entry point shared by the browser (src/browser.ts) and Node (src/index.ts).
// Sets up a new game and starts the intro.
export class Main {
    private gameLoop: GameLoop;

    constructor() {
        this.gameLoop = GameLoop.create();
    }

    public getGameLoop(): GameLoop {
        return this.gameLoop;
    }

    public async initialize(): Promise<void> {
        // Initialize starting resources
        const dataModel = this.gameLoop.getDataModel();
        dataModel.setCurrentDay(1);
        dataModel.set('population', 5);
        dataModel.set('food', 10);
        dataModel.set('wood', 5);
        dataModel.setBounty(10); // Initialize bounty to maximum (10)

        // Load text/intro.txt with the game's parser, so [event x n] effects reach the game's queue
        const event = await this.gameLoop.getParser().loadEvent('intro');
        
        if (event.getSections().length === 0) {
            throw new Error("Failed to load intro event or intro.txt is empty");
        }

        this.gameLoop.addEvent(event);
        this.gameLoop.next();
    }
}
