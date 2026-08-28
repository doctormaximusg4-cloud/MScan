var exec=require('cordova/exec');
module.exports={
 start:function(success,error){exec(success,error,'MScanCamera','start',[]);},
 stop:function(success,error){exec(success,error,'MScanCamera','stop',[]);}
};
