var express = require('express');
var router = express.Router();


module.exports.getRouter = function(io){

	router.get('/', function(req, res, next) {
		res.render('index.html');
	});
	
	var roomIdCount = 0;
	var userCount = 1;
	var horizontalCellNum = 80;
	var verticalCellNum = 50;
	var initialPlacableCellAmount = 30;
	var activeRooms = {'room0': generateRoom() };

	io.sockets.on('connection', function(socket){
		socket.on('joinRoom',function(data){
			socket.data = {};
			socket.data.id = userCount++;
			socket.data.username = data.username;
			socket.data.colour = data.colour;
			socket.data.cellsLeft = initialPlacableCellAmount;
			socket.data.readyToPlay = false;
			if (activeRooms['room' + roomIdCount].species.length == 2 ){
				activeRooms['room' + (++roomIdCount)] = generateRoom();
			}
			var assignedRoom = 'room' + roomIdCount;
			socket.join(assignedRoom);
			socket.data.room = assignedRoom;
			if (activeRooms[assignedRoom].species.length === 0){
				socket.data.side = "left";
			}else if (activeRooms[assignedRoom].species.length === 1){
				socket.data.side = "right";
			}
			activeRooms[assignedRoom].species[activeRooms[assignedRoom].species.length] = socket.data;
			socket.emit('roomJoined',activeRooms[assignedRoom]);
			socket.broadcast.to(assignedRoom).emit('newSpeciesJoined',activeRooms[assignedRoom]);
		});

		socket.on('readyToPlay',function(data){
			socket.data.readyToPlay = true;
			copyWorldHalf(socket.side,activeRooms[socket.data.room].world,data.world,horizontalCellNum,verticalCellNum);
			var allReadyToPlay = true;
			for (var i = 0; i < activeRooms[socket.data.room].species.length; i++){
				if (activeRooms[socket.data.room].species[i].id === socket.id){
					//TODO: Check whether this is even neccesary or if aliasing takes care of it.
					activeRooms[socket.data.room].species[i].readyToPlay = socket.data.readyToPlay;
				}
				allReadyToPlay = allReadyToPlay && activeRooms[socket.data.room].species[i].readyToPlay;
			}
			if (allReadyToPlay){
				io.sockets.in(socket.data.room).emit('allSpeciesReady',{world: activeRooms[socket.data.room].world});
				// console.log("Ready to play.");
				sendUpdatedWorld(socket.data.room);
			}
		});
	});

	function generateRoom(){
		return {species: [], world: generateBlankWorld(horizontalCellNum,verticalCellNum)};
	}

	function generateBlankWorld(horizontalCellNum,verticalCellNum){
		if (horizontalCellNum % 2 === 0){
			var cells = new Array(horizontalCellNum);
			for (var i = 0; i < horizontalCellNum; i++) {
				cells[i] = new Array(verticalCellNum);
				for (var j = 0; j < verticalCellNum; j++){
					cells[i][j] = 0;
				}
			}
			return cells;
		}else{
			console.log("horizontalCellNum:"+ horizontalCellNum +" needs to be set to an evenly divisible number.");
			return undefined;
		}
	}

	function copyWorldHalf(side,originalWorld,recievedWorld,horizontalCellNum,verticalCellNum){
		var startIndex = (side=='left')? 0 : horizontalCellNum/2;
		var endIndex = startIndex + horizontalCellNum/2;
		//TODO: Do checking that they didnt place more cells then allowed
		for (var i = startIndex; i < endIndex; i++){
			for (var j = 0; j < verticalCellNum;j++){
				originalWorld[i][j] = recievedWorld[i][j];
			}
		}
	}
	function getCell(world,i,j){
		if (i >= world.length || i < 0 || j >= world[0].length || j < 0){
			return 0;
		}
		return world[i][j];
	}
	function updateWorld(world,room){
		var worldToReturn = generateBlankWorld(world.length,world[0].length);
		for (var i = 0; i < world.length; i++){
			for (var j = 0; j < world[i].length; j++) {
				var totalNeighbourCount = 0;
				var idOfMaxNeighbour;
				var countOfMaxNeighbour = Number.NEGATIVE_INFINITY;
				for (var k = 0; k < activeRooms[room].species.length; k++){
					var id = activeRooms[room].species[k].id;
					var countForSpecies = ((getCell(world,i+1,j)===id)? 1 : 0) + ((getCell(world,i-1,j)===id)? 1 : 0) + ((getCell(world,i,j+1)===id)? 1 : 0) + ((getCell(world,i,j-1)===id)? 1 : 0) + ((getCell(world,i+1,j+1)===id)? 1 : 0) + ((getCell(world,i+1,j-1)===id)? 1 : 0) + ((getCell(world,i-1,j-1)===id)? 1 : 0) + ((getCell(world,i-1,j+1)===id)? 1 : 0);
					if (countForSpecies>countOfMaxNeighbour){
						idOfMaxNeighbour = id;
						countOfMaxNeighbour = countForSpecies;
					}
					totalNeighbourCount += countForSpecies;
				}

				if (totalNeighbourCount < 2 || totalNeighbourCount > 3){
					worldToReturn[i][j]=0;
				}
				if(totalNeighbourCount == 2){
					worldToReturn[i][j]=world[i][j];
				}
				if(totalNeighbourCount == 3){
					worldToReturn[i][j]=idOfMaxNeighbour;
				}
			}
		}
		return worldToReturn;
	}
	function sendUpdatedWorld(room){
		activeRooms[room].world = updateWorld(activeRooms[room].world);
		io.sockets.in(room).emit('worldUpdated',activeRooms[room].world);
		setTimeout(sendUpdatedWorld,250,room);
	}
	return router;
};