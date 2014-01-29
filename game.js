/*
Zombie Survival Game
by Craig Johnston
Student ID: 10021322

This game uses the Crafty games library. Everything in this file was written
from scratch.

Most of the game logic is contained in components, which can be assigned to
entities. There are 3 character types: player, soldier (friendly NPC) and
zombie (enemy NPC).

Soldiers will run for ammoboxes when they need them. Zombies will approach and
attack any non-zombie. Soldiers will shoot at zombies.
*/

/* Config */
/* All times are in milliseconds */
var ZOMBIE_SPEED = 20; //pixels per second
var SOLDIER_SPEED = 40;
var BULLET_SPEED = 400;

var PLAYER_HEALTH = 25;
var ZOMBIE_HEALTH = 3;
var SOLDIER_HEALTH = 20;

var PLAYER_AMMO = 24;
var SOLDIER_AMMO = 12;

var AMMOBOX_QUANTITY = 12; //amount of ammo in an ammobox
var AMMOBOX_MAX = 5;
var AMMOBOX_TICK = 7500;
var AMMOBOX_NEAR_DISTANCE = 75; //pixels

var SOLDIER_COUNT = 4; //max number of soldiers

var SOLDIER_FIRE_MAX = 4;

var ZOMBIE_DAMAGE = 1; //amount of damage a zombie does in one hit
var BULLET_DAMAGE = 1;
var BULLET_EXPIRATION = 6000; //how long a bullet entity lives for

var SOLDIER_AMMOHUNT_DELAY = 500; //delay between checking for new ammobox targets
var TARGETNEAREST_DELAY = 100; //delay between checking for nearby enemies
var ZOMBIEDAMAGE_TIMEOUT = 400; //length of invincibility period after getting hit

var ZOMBIE_DASHING_SPEED = 100;
var ZOMBIE_DASHING_DELAY = 300; //time to wait before dashing
var ZOMBIE_DASHING_TIMEOUT = 6000; //how long to dash for

var DAMAGEFLASH_TIMEOUT = 400; //how long to flicker for when damaged
var DAMAGEFLASH_TICK = 50; //rate (ms) of flicker

var BOUNCING_TIMEOUT = 400; //how long to bounce for
var BOUNCING_SPEED = 800;

var SCREEN_WIDTH = 600; //pixels
var SCREEN_HEIGHT = 400;

var WAVE_MAX_DISTANCE = 32 * 20; //how far offscreen members of a zombie wave can spawn
var WAVE_MIN = 10; //minimum number of zombies in a wave
var WAVE_MAX = 70;
var WAVE_END = 5;
var WAVE_TIMEOUT = 30000;

var SOLDIER_SHOOT_TICK = 200; //rate of fire for soldiers (delay between firing in ms)

var BAYES_LOW = 1;
var BAYES_MEDIUM = 2;
var BAYES_HIGH = 3;

var AFRAID_TIMEOUT = 2000;

$(document).ready(function() {
    Crafty.init(SCREEN_WIDTH, SCREEN_HEIGHT);

    /* Sprites */
    Crafty.sprite(32, "images/player.png", {
        player: [0,0]
    });
    Crafty.sprite(32, "images/npc.png", {
        npc: [0,0]
    });
    Crafty.sprite(32, "images/zombie.png", {
        zombie: [0,0]
    });
    Crafty.sprite(32, "images/emoticons.png", {
        emoticon: [0,0]
    });
    Crafty.sprite(4, "images/bullet.png", {
        bullet: [0,0]
    });
    Crafty.sprite(16, "images/ammobox.png", {
        ammobox: [0,0]
    });
    
    /* Utility functions */
    
    //Number of frames to move at a certain speed to a target's position
    function frames_to_target(actor, target, speed) {
         return (Crafty.timer.getFPS() * (1.0/speed) 
                 * Crafty.math.distance(actor._x, actor._y, 
                                        target._x, target._y)
                );
    }
    
    //Direction of b entity from a entity as {x: 1 or -1, y: 1 or -1}
    function direction_of(a, b) {
        return {x: a._x < b._x ? 1 : -1, y: a._y < b._y ? 1 : -1};
    }
    
    //Random integer from a specified range
    function random_int(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }
    
    //Fuzzy logic downslope calculator
    function fuzzy_downslope(x, left, right) {
        return ((right-x*1.0)/(right-left));
    }
    
    //Fuzzy logic upslope calculator
    function fuzzy_upslope(x, left, right) {
        return ((x-left*1.0)/(right-left));
    }
    
    function fuzzy_and(x, y) {
        if (x < y) return x;
        else return y;
    }
    
    function fuzzy_or(x, y) {
        if (x < y) return y;
        else return x;
    }
    
    /* Moves towards target */
    Crafty.c("Follow", {
        init: function() {
            this.target = null;
            
            this.bind('EntityUpdate', function (dt) {                
                //if has target, follow target
                if (this.target !== null && !this.bouncing) {
                    this.tween(
                        {x: this.target._x, y: this.target._y}, 
                        frames_to_target(this, this.target, this.speed)
                    );
                }
            });
        },
        setSpeed: function(speed) {
            this.speed = speed;
        }
    });
    
    /* Goes for ammo boxes that aren't dangerously surrounded */
    Crafty.c("AmmoHunter", {
        init: function() {
            this.ammohunt_timer = 0;
            this.ammobox_target = null;
            this.ammoboxes = null;
            this.ammo_run_data = [];
            this.ammobox_approach = false;
            
            this.bind('EntityUpdate', function(dt) {
                this.ammohunt_timer += dt;
                if (this.ammobox_target === null && !this.afraid) { //look for an ammobox
                    if (this.ammohunt_timer >= SOLDIER_AMMOHUNT_DELAY) {
                        this.ammohunt_timer -= SOLDIER_AMMOHUNT_DELAY;
                        //sort through the ammoboxes to get the closest safe box
                        var sorted_boxes = this.get_ammoboxes_by_distance();
                        for (var i = 0; i < sorted_boxes.length; i++) {
                            var ammobox_claimed = false;
                            for (var j = 0; j < this.soldier_list.length; j++) {
                                if (this.soldier_list[j].ammobox_target !== null && this.soldier_list[j].ammobox_target[0] === sorted_boxes[i].box[0]) {
                                    ammobox_claimed = true;
                                    break;
                                }
                            }
                            if (!ammobox_claimed && this.check_ammobox_danger(sorted_boxes[i])) {
                                this.ammobox_target = sorted_boxes[i].box;
                                break;
                            }
                        }
                    }
                } else if (!this.ammobox_approach && this.ammobox_target !== null) { //go for the target ammobox
                    
                        this.tween({x: this.ammobox_target._x, y: this.ammobox_target._y}, frames_to_target(this, this.ammobox_target, this.speed));
                        this.ammobox_approach = true;
                }
            });
            
            /* Check if an ammobox is safe */
            this.check_ammobox_danger = function(boxpackage) {
                var ammobox = boxpackage.box;
                var distance = boxpackage.distance;
                var nearby_zombies = 0;
                var nearby_goodguys = 0;
                for (var i = 0; i < this.zombies_list.length; i++) {
                    if (Crafty.math.distance(
                            ammobox._x, ammobox._y, 
                            this.zombies_list[i]._x, this.zombies_list[i]._y
                       ) < AMMOBOX_NEAR_DISTANCE) {
                        nearby_zombies += 1;
                    }
                }
                for (var i = 0; i < this.goodguys_list.length; i++) {
                    if (Crafty.math.distance(
                            ammobox._x, ammobox._y, 
                            this.goodguys_list[i]._x, this.goodguys_list[i]._y
                        ) < AMMOBOX_NEAR_DISTANCE) {
                        nearby_goodguys += 1;
                    }
                }
                var ratio = 0;
                if (nearby_zombies > 0 && nearby_goodguys > 0) {
                    ratio = (nearby_zombies*1.0)/nearby_goodguys; //ratio of zombies to goodguys
                }
                
                var danger = BAYES_MEDIUM;
                if (fuzzy_and(this.fuzzy_low_health(this.health), this.fuzzy_high_ratio(ratio))) {
                    danger = BAYES_HIGH;
                } else if (fuzzy_and(this.fuzzy_high_health(this.health), this.fuzzy_low_ratio(ratio))) {
                    danger = BAYES_LOW;
                }
                
                //build data about this situation
                var data = {
                    health: (this.health <= SOLDIER_HEALTH/4.0 
                                ? BAYES_LOW 
                            :(this.health >= SOLDIER_HEALTH*3.0/4.0 
                                ? BAYES_HIGH 
                                : BAYES_MEDIUM)),
                    ammo: (this.ammo <= SOLDIER_AMMO/4.0 
                                ? BAYES_LOW 
                          :(this.ammo >= SOLDIER_AMMO*3.0/4.0 
                                ? BAYES_HIGH 
                                : BAYES_MEDIUM)),
                    danger: danger
                };
                //calculate the probability that it's a good idea to go for the ammobox
                //adjust for emotional distress
                var probability = this.bayes.calculate_probability(data);
                if (probability === false 
                    || (!this.afraid && !this.angry && probability >= 0.5) 
                    || (this.angry && probability >= 0.3) 
                    || (this.afraid && probability >= 0.7)) {
                    this.ammo_run_data.push(data);
                    return true;
                }
                return false;
            };
            
            this.fuzzy_low_health = function(x) {
                var left = SOLDIER_HEALTH / 4.0;
                var right = (SOLDIER_HEALTH*3) / 4.0                
                if (x<=left) return 1;
                else if (x >= right) return 0;
                else return fuzzy_downslope(x, left, right);
            }
            
            this.fuzzy_high_health = function(x) {
                var left = SOLDIER_HEALTH / 4.0;
                var right = (SOLDIER_HEALTH*3) / 4.0
                if (x<=left) return 0;
                else if (x >= right) return 1;
                else return fuzzy_upslope(x, left, right);
            }
            
            this.fuzzy_low_ratio = function(x) {
                var left = 3.0;
                var right = 6.0;
                if (x<=left) return 1;
                else if (x >= right) return 0;
                else return fuzzy_downslope(x, left, right);
            }
            
            this.fuzzy_high_ratio = function(x) {
                var left = 3.0;
                var right = 6.0;
                if (x<=left) return 0;
                else if (x >= right) return 1;
                else return fuzzy_upslope(x, left, right);
            }
            
            //loop through all of the boxes and return them ordered by distance
            this.get_ammoboxes_by_distance = function() {    
                var boxdistances = [];
                for (var i = 0; i < this.ammoboxes.length; i++) {
                    boxdistances.push(
                        {box: this.ammoboxes[i],
                         distance: Crafty.math.distance(this._x, 
                                                        this._y, 
                                                        this.ammoboxes[i]._x, 
                                                        this.ammoboxes[i]._y
                                                        )
                        });
                }
                boxdistances.sort(function (a, b) {
                    b.distance-a.distance;
                });
                return boxdistances;
            };
        },
        ammohunter_setup: function(ammobox_list, zombies_list, goodguys_list) {
            this.ammoboxes = ammobox_list;
            this.zombies_list = zombies_list;
            this.goodguys_list = goodguys_list;
        }
    });
    
    /* Has health and can take damage and die. Flashes when damaged and bounces 
    away from the source of the damage. */
    Crafty.c("HasHealth", {
        init: function() {        
            this.health = 0;
            this.injured = false;
            this.onDeath = function() {}; //callback, called when entity is killed
            this.dead = false;
            
            this.damageflash = false; //is the entity flickering?
            this.damageflash_timer = 0; //how long until it stops flickering
            this.damageflash_tick = 0; //controls the rate of flickering
            this.tinted = false;
            
            this.bouncing = false; //is the entity bouncing after damage
            this.bouncing_timer = 0; //how long until it stops bouncing
            this.bouncing_tick = 0; //controls the bounce speed
            this.bouncing_direction = {};
            
            this.bind("EntityUpdate", function(dt) {
                if (this.damageflash) {
                    this.damageflash_timer -= dt;
                    this.damageflash_tick -= dt;
                    if (this.damageflash_timer > 0 && this.damageflash_tick <= 0) {
                        if (this.tinted) {
                            this.alpha = 1.0;
                        } else {
                            this.alpha = 0.3;
                        }
                        this.tinted = !this.tinted;
                        this.damageflash_tick = DAMAGEFLASH_TICK;
                    } else if (this.damageflash_timer <= 0) {
                        this.damageflash = false;
                        this.damageflash_timer = 0;
                        this.alpha = 1.0;
                    }
                }
                if (this.bouncing) {
                    this.bouncing_timer -= dt;
                    this.bouncing_tick += dt;
                    if (this.bouncing_timer > 0) {
                        if (this.bouncing_tick > 1000/BOUNCING_SPEED) {
                            this.x += this.bouncing_direction.x;
                            this.y += this.bouncing_direction.y;
                            this.bouncing_tick -= 1000/BOUNCING_SPEED;
                        }
                    } else {
                        this.bouncing = false;
                        this.bouncing_timer = 0;
                        if (this.ammobox_approach) {
                            this.tween({x: this.ammobox_target._x, y: this.ammobox_target._y}, frames_to_target(this, this.ammobox_target, this.speed));
                        }
                    }
                }
            });
        },
        healthSetup: function(health) {
            this.health = health;
        },
        damage: function(amount, entity) {
            if (!this.bouncing) {
                this.bouncing = true;
                this.bouncing_timer = BOUNCING_TIMEOUT;
                this.bouncing_tick = 0;
                this.bouncing_direction = {x: this._x < entity._x ? -1 : 1, y: this._y < entity._y ? -1 : 1};                
            }
            this.health -= amount;            
            if (this.health <= 0) {
                this.dead = true;
                this.onDeath();
                this.destroy();
            } else {
                this.injured = true;
                this.damageflash = true;
                this.damageflash_timer = DAMAGEFLASH_TIMEOUT;
                this.damageflash_tick = DAMAGEFLASH_TICK;
            }
        }
    });
    
    /* Dashes at target when injured */
    Crafty.c("InjuryAnger", {
        init: function() {
            this.dashing = false;
            this.dashing_delay = 0;
            this.dashing_timeout = 0;
            
            this.bind('EntityUpdate', function(dt) {
                if (this.injured && !this.dashing) {
                    this.dashing = true;
                    this.showAngry();
                    this.dashing_delay = this.dashing_delay_val;
                    this.dashing_timeout = this.dashing_timeout_val;
                } else if (this.dashing) {
                    if (this.dashing_delay > 0) {
                        this.dashing_delay -= dt;
                        if (this.dashing_delay < 0) {
                            this.dashing_delay = 0;
                            this.old_speed = this.speed;
                            this.speed = this.dashing_speed;
                        }
                    } else {
                        if (this.dashing_timeout > 0) {
                            this.dashing_timeout -= dt;
                            if (this.dashing_timeout < 0) {
                                this.dashing_timeout = 0;
                                this.dashing = false;
                                this.injured = false;
                                this.hideEmoticon();
                                this.speed = this.old_speed;
                            }
                        }
                    }
                }
            });
        },
        dashing_init: function(speed, delay, timeout) {
            this.dashing_speed = speed;
            this.dashing_delay_val = delay; 
            this.dashing_timeout_val = timeout;
        }
    });
    
    /* Becomes afraid when injured */
    Crafty.c("InjuryFear", {
        init: function() {
            this.afraid = false;
            this.afraid_timer = 0;
            
            this.bind('EntityUpdate', function(dt) {
                if (this.afraid) {
                    this.afraid_timer += dt;
                    if (this.afraid_timer > AFRAID_TIMEOUT) {
                        this.afraid = false;
                        this.hideEmoticon();
                        this.afraid_timer = 0;
                    }
                }
                if (this.injured && !this.afraid) {
                    this.afraid = true;
                    this.injured = false;
                    this.showAfraid();
                }
            });
        }
    });
    
    /* Can show emoticons which hover above the entity */
    Crafty.c("Emoticons", {
        init: function() {
            this.emoticon = null;
            
            this.bind('EntityUpdate', function(dt) {
                if (this.emoticon !== null) {
                    if (this._x != this.emoticon._x) {
                        this.emoticon.x = this._x;                    
                    }
                    if (this._y - 32 != this.emoticon._y) {
                        this.emoticon.y = this._y - 32;
                    }
                }
            });
        },
        createEmoticon: function() {
            this.emoticon = Crafty.e("2D, Sprite, DOM, emoticon");
        },
        showAngry: function() {    
            if (this.emoticon === null) { this.createEmoticon(); }        
            this.emoticon.sprite(0, 0, 1, 1);
        },
        showAfraid: function() {
            if (this.emoticon === null) { this.createEmoticon(); }
            this.emoticon.sprite(1, 0, 1, 1);
        },
        showAmmo: function() {
            if (this.emoticon === null) { this.createEmoticon(); }
            this.emoticon.sprite(2, 0, 1, 1);
        },
        showHealth: function() {
            if (this.emoticon === null) { this.createEmoticon(); }
            this.emoticon.sprite(3, 0, 1, 1);
        },
        hideEmoticon: function() {
            if (this.emoticon !== null) { 
                this.emoticon.destroy(); 
                this.emoticon = null;
            }
        }
    });
    
    /* Bullet entity template. Is fired using the Gun component, travels for a
    certain amount of time (specified by BULLET_EXPIRATION). If it hits a zombie
    it damages the zombie (amount specified by BULLET_DAMAGE) and then destroys
    itself. If it hits nothing, it destroys itself when it runs out of time.*/
    Crafty.c("Bullet", {
        init: function() {
            this.addComponent("2D, Sprite, DOM, Collision, bullet");
            this.fired = false;
            this.bullet_timer = 0;
            this.expiration_timer = BULLET_EXPIRATION;
            this.expired = false;
            
            this.bind("EntityUpdate", function(dt) {
                if (this.fired) {
                    this.bullet_timer += dt;                    
                    this.expiration_timer -= dt;
                    if (this.expiration_timer <= 0) {
                        this.expired = true;
                        this.destroy();
                    }
                    if (this.bullet_timer >= 1000/this.speed) {
                        this.bullet_timer -= 1000/this.speed;
                        this.x += this.x_direction;
                        this.y += this.y_direction;
                    }
                }
            });
            
            this.onHit("Zombie", function(target) {
                var zombie = target[0].obj;
                zombie.damage(BULLET_DAMAGE, this);
                this.expired = true;
                this.destroy();
            });
        },
        fireBullet: function(x, y, x_direction, y_direction, speed) {
            this.x = x;
            this.y = y;
            this.x_direction = x_direction;
            this.y_direction = y_direction;
            this.speed = speed;
            this.fired = true;
        }
    });
    
    /* Has ammo and can fire it in currently faced direction */
    Crafty.c("Gun", {
        init: function() {
            this.ammo = 0;
        
            this.bind('KeyDown', function(e) {
                if (e.key == Crafty.keys['SPACE']) {
                    this.fire();
                }
            });            
        },
        fire: function() {
            if (this.ammo > 0) {
                this.ammo -= 1;
                var bullet = Crafty.e("Bullet");
                bullet.fireBullet(this._x + 16, this._y + 16, this.x_direction, this.y_direction, BULLET_SPEED);
                return bullet;
            }
            return false;
        }
    });
    
    /* Can pick up ammoboxes, gaining ammo (specified by AMMOBOX_QUANTITY) and
    destroying the ammobox. */
    Crafty.c("AmmoPickup", {
        init: function() {
            this.onAmmoPickup = function() { };
            this.onHit("Ammobox", function(target) {
                var ammobox = target[0].obj;
                ammobox.ammobox_list.splice(ammobox.ammobox_list.indexOf(ammobox), 1);
                ammobox.destroy();
                this.ammo += AMMOBOX_QUANTITY;
                this.onAmmoPickup(ammobox);
            });
        }
    });
    
    /* Will take damage from zombies */
    Crafty.c("ZombieDamage", {
        init: function() {
            this.zombiedamage_timer = 0;
        
            this.bind("EntityUpdate", function(dt) {
                if (this.zombiedamage_timer != 0) {
                    this.zombiedamage_timer -= dt;
                    if (this.zombiedamage_timer < 0) {
                        this.zombiedamage_timer = 0;
                    }
                }
            });
        
            this.onHit("Zombie", function(target) {
                //zombies hurt good guys, and only hurt other zombies when
                //they're starving
                var zombie = target[0].obj;
                if (this.zombiedamage_timer == 0) {
                    if (!this.__c["Zombie"] || zombie.starving) { 
                        this.zombiedamage_timer = ZOMBIEDAMAGE_TIMEOUT;                       
                        this.damage(ZOMBIE_DAMAGE, zombie);                        
                    }
                }
            });
        }
    });
    
    /* Lines up and shoots at its target */
    Crafty.c("ShootTarget", {
        init: function() {
            this.shoot_tick = 0;
            this.fired_bullets = [];
        
            this.bind("EntityUpdate", function(dt) {
                for (var i = 0; i < this.fired_bullets.length; i++) {
                    if (this.fired_bullets[i].expired) {
                        this.fired_bullets.splice(i, 1);
                    }
                }
                if (this.target !== null && this.target.dead) {
                    this.target = null;
                }
                if (this.shoot_tick < SOLDIER_SHOOT_TICK) { this.shoot_tick += dt; }
                if (this.ammobox_target === null) { //only try to shoot if not running for an ammobox
                    if (this.target !== null) {
                        if (Math.abs(this._x - this.target._x) < 8) {
                            if (this.shoot_tick >= SOLDIER_SHOOT_TICK && this.fired_bullets.length < SOLDIER_FIRE_MAX) {   
                                this.shoot_tick -= SOLDIER_SHOOT_TICK;                 
                                var direction = direction_of(this, this.target);
                                this.x_direction = 0;
                                this.y_direction = direction.y; 
                                var bullet = this.fire();
                                if (bullet !== false) {                           
                                    this.fired_bullets.push(bullet);
                                }
                            }
                        } else if (Math.abs(this._y - this.target._y) < 8) {
                            if (this.shoot_tick >= SOLDIER_SHOOT_TICK && this.fired_bullets.length < SOLDIER_FIRE_MAX) {   
                                this.shoot_tick -= SOLDIER_SHOOT_TICK;                 
                                var direction = direction_of(this, this.target);
                                this.x_direction = direction.x;
                                this.y_direction = 0;
                                var bullet = this.fire();
                                if (bullet !== false) {                           
                                    this.fired_bullets.push(bullet);
                                }
                            }
                        } else {
                            if (Math.abs(this._x - this.target._x) < Math.abs(this._y - this.target._y))   {                      
                                this.tween(
                                    {x: this.target._x}, 
                                    Crafty.timer.getFPS() * (1.0/this.speed) * (Math.abs(this.target._x - this._x))
                                );
                            } else {
                                this.tween(
                                    {y: this.target._y}, 
                                    Crafty.timer.getFPS() * (1.0/this.speed) * (Math.abs(this.target._y - this._y))
                                );
                            }
                        }
                    }
                }
            });
        }
    });
    
    /* Targets the nearest enemy */
    Crafty.c("TargetNearest", {
        init: function() {
            this.target = null;
            this.enemy_list = null;
            this.targetnearest_timer = 0;            
            this.onNewTarget = function () {};
            
            this.bind('EntityUpdate', function(dt) {
                this.targetnearest_timer += dt;
                if (this.target === null || this.target.dead) {
                    if (this.targetnearest_timer > TARGETNEAREST_DELAY) {
                        this.targetnearest_timer -= TARGETNEAREST_DELAY;
                        if (this.enemy_list !== null && this.enemy_list.length > 0) {
                            var nearest = {
                                entity: this.enemy_list[0],
                                distance: Crafty.math.distance(this._x, 
                                                               this._y, 
                                                               this.enemy_list[0]._x, 
                                                               this.enemy_list[0]._y)
                            };
                            for (var i = 1; i < this.enemy_list.length; i++) {
                                var distance = Crafty.math.distance(this._x, this._y, 
                                    this.enemy_list[i]._x, this.enemy_list[i]._y);
                                if (distance > nearest.distance) {
                                    if (this.__c['Soldier'] !== null) {
                                        if (this.enemy_list[i]._x < 0 || this.enemy_list[i]._y < 0 || this.enemy_list[i]._x > SCREEN_WIDTH || this.enemy_list[i]._y > SCREEN_HEIGHT) {
                                            continue;
                                        }
                                    }
                                    nearest = {
                                        entity: this.enemy_list[i],
                                        distance: distance
                                    };
                                }
                                
                            }
                            if ((this.__c['Soldier'] !== null && !(nearest.entity._x < 0 || nearest.entity._y < 0 || nearest.entity._x > SCREEN_WIDTH || nearest.entity._y > SCREEN_HEIGHT)) || this.__c['Soldier'] === null) {
                                this.target = nearest.entity;
                                this.onNewTarget();
                            }
                        }
                    }
                }
            });
        },
        setEnemyList: function(list) {
            this.enemy_list = list;
        }
    });
    
    /* Stays within range of a specified target */
    Crafty.c("StayNear", {
        init: function() {
            this.staynear_target = null;
        
            this.bind("EntityUpdate", function(dt) {
                if (this.staynear_target != null) {
                    if (Crafty.math.distance(this._x, this._y, 
                            this.staynear_target._x, this.staynear_target._y) > this.staynear_max_distance) {
                            
                    }
                }
            });
        },
        stay_near: function(target, max_distance) {
            this.staynear_target = target;
            this.staynear_max_distance = max_distance;
        }
    });
    
    /* Entity code */
    
    /* Ammobox entity code. Just a dummy entity that can be collided with
    and shows a sprite. */
    Crafty.c("Ammobox", {
        init: function() {
            this.addComponent("2D, Sprite, DOM, Collision, ammobox");
        }
    });
    
    Crafty.c("BayesClassifier", {
        init: function() {
            this.training_data = [];
            this.average_length_of_life = 0;
            this.p = 1.0 / 3;
            this.m = 3.0;
        },
        add_training_data: function(health, ammo, danger, length_of_life) {
            var success = length_of_life > this.average_length_of_life;
            this.average_length_of_life += length_of_life / (this.training_data.length + 1.0);
            this.training_data.push({
                health: health,
                ammo: ammo,
                danger: danger,
                success: success
            });
        },
        calculate_probability: function(test_data) {
            if (this.training_data.length > 0) {
                var successes = 0;
                var count = [0, 0, 0];
                for (var i = 0; i < this.training_data.length; i++) {                
                    if (this.training_data[i].success) {
                        successes += 1;
                    }
                }
                var success_probability = successes / (this.training_data.length * 1.0)
                for (i = 0; i < this.training_data[0].length - 1; i++) {
                    for (var j = 0; j < this.training_data.length; j++) {
                        if (test_data[i] == this.training_data[j][i] && this.training_data[j].success) {
                            count[i] += 1;
                        }
                    }
                    success_probability *= (count[i] + this.m * this.p) / (successes + this.m * 1.0);
                }
                return success_probability;
            }
            return false; // we don't have any data to work with yet
        }
    });
    
    /* Zombie entity code */
    Crafty.c("Zombie", {
        init: function() {
            this.addComponent("2D, SpriteAnimation, DOM, Tween, Collision");
            this.addComponent("zombie, HasHealth, Follow, TargetNearest, Emoticons, InjuryAnger");
            this.setSpeed(ZOMBIE_SPEED);
            this.dashing_init(ZOMBIE_DASHING_SPEED, ZOMBIE_DASHING_DELAY, ZOMBIE_DASHING_TIMEOUT);
            this.health = ZOMBIE_HEALTH;
            this.outside_level = true;
            this.onDeath = function() {
                if (this.emoticon !== null) { this.emoticon.destroy(); }
                this.zombielist.splice(this.zombielist.indexOf(this), 1);
            };
            this.bind("EntityUpdate", function() {
                if (this.outside_level) { // only add the zombie to the list of active zombies if it's onscreen
                    if ((this._x > 0 && this._x < SCREEN_WIDTH) && (this._y > 0 && this._y < SCREEN_HEIGHT)) {
                        this.outside_level = false;
                        this.zombielist.push(this);
                    }
                }
            });
        },
        setZombieList: function(zombielist) {
            this.zombielist = zombielist;
        }
    });
    
    /* Soldier entity code */
    Crafty.c("Soldier", {
        init: function() {
            this.addComponent("2D, SpriteAnimation, DOM, Tween, Collision");
            this.addComponent("npc, TargetNearest, AmmoPickup, ZombieDamage, AmmoHunter, Gun, HasHealth, Emoticons, InjuryFear, ShootTarget");
            
            this.ammo = SOLDIER_AMMO;
            this.health = SOLDIER_HEALTH;
            this.speed = SOLDIER_SPEED;
            this.life_length = 0;
            this.soldier_list = null;
            
            this.bind("EntityUpdate", function(dt) {
                this.life_length += dt;
                
                //don't leave the screen boundaries
                if (this._x < 0 || this._x > SCREEN_WIDTH || this._y < 0 || this._y > SCREEN_HEIGHT) {
                    this.bouncing = true;
                    this.bouncing_timer = BOUNCING_TIMEOUT;
                    this.bouncing_tick = 0;
                
                    var x_direction = 0;
                    var y_direction = 0;
                    
                    if (this._x < 0) { x_direction = 1; }
                    if (this._x > SCREEN_WIDTH - 32) { x_direction = -1; }
                    if (this._y < 0) { y_direction = 1; }
                    if (this._y > SCREEN_HEIGHT - 32) { y_direction = -1; }
                    
                    this.bouncing_direction = {x: x_direction, y: y_direction};                
                }
            });
            
            this.onDeath = function() {
                if (this.emoticon !== null) { this.emoticon.destroy(); }
                for (var i = 0; i < this.soldier_list.length; i++) {
                    this.soldier_list[i].notify_death(this);
                }
                for (i = 0; i < this.ammo_run_data.length; i++) {
                    this.bayes.add_training_data(
                        this.ammo_run_data[i].health,
                        this.ammo_run_data[i].ammo,
                        this.ammo_run_data[i].danger,
                        this.life_length
                    );
                }
                this.soldier_list.splice(this.soldier_list.indexOf(this), 1);
            };
            
            this.onNewTarget = function() {
                this.fired_bullets = [];
            };
            
            this.onAmmoPickup = function(ammobox) {
                if (this.ammobox_approach) {
                    this.ammobox_approach = false;
                    this.ammobox_target = null;
                }
                for (var i = 0; i < this.soldier_list.length; i++) {
                    if (this.soldier_list[i].ammobox_target !== null && ammobox[0] == this.soldier_list[i].ammobox_target[0]) {
                        this.soldier_list[i].notify_ammobox_pickup();
                    }
                }
            };
        },
        setSoldierList: function(soldier_list) {
            this.soldier_list = soldier_list;
        },
        notify_death: function(soldier) {
            this.showAngry();
        },
        setBayes: function(bayes) {
            this.bayes = bayes;
        },
        notify_ammobox_pickup: function() {
            if (this.ammobox_target !== null) {
                this.ammobox_approach = false;
                this.ammobox_target = null;
            }
        }
    });    
    
    /* Player entity code */
    Crafty.c("Player", {
        init: function() {
            this.addComponent("2D, SpriteAnimation, DOM, Fourway, Collision");
            this.addComponent("player, HasHealth, Gun, AmmoPickup, ZombieDamage");
            
            this.ammo = PLAYER_AMMO;
            this.health = PLAYER_HEALTH;
            
            this.fourway(3);
            this.flipped = false;
            
            this.x_direction = 0;
            this.y_direction = 1;
            
            this.bind("NewDirection", function(direction) {
                if (!(direction.x == 0 && direction.y == 0)) {
                    this.x_direction = direction.x;
                    this.y_direction = direction.y;
                }
                if (direction.x < 0) {
                    if (this.flipped) {
                        this.unflip("X");
                        this.flipped = false;
                    }
                    this.animate("walk_left", 6, 0, 8);
                    this.animate("walk_left", 30, -1);
                } else if (direction.x > 0) {
                    if (!this.flipped) {
                        this.flip("X");
                        this.flipped = true;
                    }
                    this.animate("walk_right", 6, 0, 8);
                    this.animate("walk_right", 30, -1);
                }
                if (direction.y < 0) {
                    this.animate("walk_up", 3, 0, 5);
                    this.animate("walk_up", 30, -1);
                } else if (direction.y > 0) {
                    this.animate("walk_down", 0, 0, 2);
                    this.animate("walk_down", 30, -1);
                }
            });
        }
    });        
    
    Crafty.scene("main", function() {
        var zombies = [];
        var soldiers = [];
        var player = null;
        var goodguys = [];
        var ammoboxes = [];
        
        var player_health_history = 0;
        var player_ammo_history = 0;
        
        var ui_player_health = null;
        var ui_player_ammo = null;
        
        var time_since_wave = 0;
        
        Crafty.background("#b1c7b5");
        
        var bayes = Crafty.e("BayesClassifier");
        
        var manager = Crafty.e("DOM")
            .attr({x: 0, y: 0, last_time: new Date().getTime(), ammobox_tick: 0})
            .bind("EnterFrame", function() {
                var dt = new Date().getTime() - this.last_time;
                time_since_wave += dt;
                this.last_time += dt;
                if (ammoboxes.length < AMMOBOX_MAX) { this.ammobox_tick += dt; }                
                Crafty.trigger("EntityUpdate", dt);
                if (player.health != player_health_history) {
                    player_health_history = player.health;
                    ui_player_health.text("Health: " + player.health.toString());
                }
                if (player.ammo != player_ammo_history) {
                    player_ammo_history = player.ammo;
                    ui_player_ammo.text("Ammo: " + player.ammo.toString());
                }
                if (player.dead) { //respawn the player if dead
                    spawn_player(
                        Math.floor(Math.random() * SCREEN_WIDTH - 20) + 20, 
                        Math.floor(Math.random() * SCREEN_HEIGHT - 20) + 20
                    );
                }
                if (this.ammobox_tick >= AMMOBOX_TICK) {
                    this.ammobox_tick -= AMMOBOX_TICK;
                    spawn_ammobox();
                }
                if (soldiers.length < SOLDIER_COUNT) { //respawn a soldier if dead
                    spawn_soldier(
                        Math.floor(Math.random() * SCREEN_WIDTH - 20) + 20, 
                        Math.floor(Math.random() * SCREEN_HEIGHT - 20) + 20
                    );
                }
                if (zombies.length < WAVE_END && time_since_wave > WAVE_TIMEOUT) {
                    spawn_zombie_wave();
                    time_since_wave = 0;
                }
            });
        
        function spawn_ammobox() {
            ammoboxes.push(
                Crafty.e("Ammobox")
                    .attr({
                        x: Math.floor(Math.random() * SCREEN_WIDTH - 20) + 20, 
                        y: Math.floor(Math.random() * SCREEN_HEIGHT - 20) + 20, 
                        z: 1,
                        ammobox_list: ammoboxes
                    })
            );
        }
        
        function spawn_player(x, y) {
            player = Crafty.e("Player").attr({x: x, y: y, z: 1});
        }
        
        function spawn_zombie_wave() {
            var size = random_int(WAVE_MIN, WAVE_MAX);
            var direction = random_int(1, 4); //1:left, 2:top, 3:right, 4:bottom
            for (var i = 0; i < size; i++) {
                var x = null;
                var y = null;
                if (direction == 1 || direction == 3) {
                    y = random_int(20, SCREEN_HEIGHT-20);
                    if (direction == 1) {
                        x = random_int(32, WAVE_MAX_DISTANCE) * -1;
                    } else {
                        x = random_int(32, WAVE_MAX_DISTANCE) + SCREEN_WIDTH;
                    }
                } else {
                    x = random_int(20, SCREEN_WIDTH-20);
                    if (direction == 2) {
                        y = random_int(32, WAVE_MAX_DISTANCE) * -1;
                    } else {
                        y = random_int(32, WAVE_MAX_DISTANCE) + SCREEN_HEIGHT;
                    }
                }
                spawn_zombie(x, y);
            }
        }
        
        function spawn_zombie(x, y) {  
            var zombie = Crafty.e("Zombie").attr({x: x, y: y, z: 1});
            zombie.setEnemyList(goodguys);
            zombie.hideEmoticon();
            zombie.setZombieList(zombies);
        }
        
        function spawn_soldier(x, y) {
            var soldier = Crafty.e("Soldier")
                .attr({x: x, y: y, z: 1});
            soldier.setEnemyList(zombies);
            soldier.ammohunter_setup(ammoboxes, zombies, goodguys);
            soldier.setSoldierList(soldiers);
            soldier.setBayes(bayes);
            soldiers.push(soldier);
        }
        
        function init_ui() {
            ui_player_health = Crafty.e("2D, DOM, Text")
                .attr({x: 20, y: 20})
                .text("Health: " + player.health.toString());
                
            ui_player_ammo = Crafty.e("2D, DOM, Text")
                .attr({x: 20, y: 60})
                .text("Ammo: " + player.ammo.toString());
                
            player_health_history = player.health;
            player_ammo_history = player.ammo;
        }
        
        function init() {
            spawn_player(300, 200);
            spawn_soldier(200, 200);
            spawn_soldier(250, 150);      
            spawn_soldier(350, 225);      
            spawn_soldier(400, 175);                  
            goodguys = soldiers.concat([player]);

            spawn_zombie_wave();

            /*spawn_zombie(200, 200);
            spawn_zombie(200, 230);
            spawn_zombie(180, 160);
            spawn_zombie(100, 200);
            spawn_zombie(200, 100);*/

            init_ui();          
        }
        
        init();
    });

    Crafty.scene("main"); //start the game
});
