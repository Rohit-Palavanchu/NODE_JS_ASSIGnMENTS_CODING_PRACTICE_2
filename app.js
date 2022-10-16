const express=require("express");
const bcrypt=require("bcrypt");
const path=require("path");
const {open}=require("sqlite");
const sqlite3=require("sqlite3");
const jwt=require("jsonwebtoken")

const app=express();
const dbPath=path.join(__dirname,"twitterClone.db");
app.use(express.json());
let db=null;

const authenticateToken=(request,response,next)=>{
    let authHeader=request.headers['authorization']
    let jwtToken;
    if(authHeader!==undefined){
        jwtToken=authHeader.split(" ")[1];
        jwt.verify(jwtToken,"TWITTER",async(error,payload)=>{
            if(error){
                response.status(401);
                response.send("Invalid JWT Token");
            }
            else{
                next();
            }
        })
    }
    else{
        response.status(401);
        response.send("Invalid JWT Token");
    }
}

const initializeDBAndServer=async()=>{
    try {
        db=await open({filename:dbPath,driver:sqlite3.Database});
        app.listen(3000);
    } catch (error) {
        console.log(error.message);
    }
}
initializeDBAndServer();
app.post('/register/',async (request,response)=>{
    let {username,password,name,gender}=request.body
    let query=`SELECT * FROM user WHERE username='${username}'`
    let execQuery=await db.get(query);
    if(execQuery!==undefined){
        response.status(400);
        response.send("User already exists");
    }
    
    else{
        if(password.length<6){
            response.status(400);
            response.send("Password is too short");
        }
        else{
            const encPassword=await bcrypt.hash(password,10);
            console.log(encPassword)
            query=`INSERT INTO user (username,password,name,gender) VALUES ('${username}','${encPassword}','${name}','${gender}')`
            execQuery=await db.run(query);
            response.send("User created successfully");
        }
    }
    
})
app.post('/login/',async (request,response)=>{
    let {username,password}=request.body;
    let query=`SELECT * FROM user WHERE username='${username}'`;
    let execQuery=await db.get(query);
    if(execQuery===undefined){
        response.status(400);
        response.send("Invalid user");
    }
    else{
        const comparePassword=await bcrypt.compare(password,execQuery.password);
        if(comparePassword){
            let jwtToken=jwt.sign({username:username},"TWITTER");
            response.send({jwtToken});
        }
        else{
            response.status(400);
            response.send("Invalid password");
        }
    }
})
app.get('/user/tweets/feed/',authenticateToken,async(request,response)=>{
    let query=`SELECT DISTINCT username,tweet,date_time AS dateTime FROM (user INNER JOIN follower ON user.user_id=
    follower.follower_user_id) AS T1 INNER JOIN tweet ON T1.user_id=tweet.user_id ORDER BY dateTime DESC LIMIT 4`
    let execQuery=await db.all(query)
    response.send(execQuery);
})
//API4
app.get('/user/following/',authenticateToken,async(request,response)=>{
    let query=`SELECT DISTINCT follower_user_id from follower inner join user on follower.follower_user_id=user.user_id ORDER BY follower_user_id`;
    let execQuery=await db.all(query)
    let a=[]
    for(let i of execQuery){
        a.push(await db.get(`SELECT name FROM user where 
        user_id=${i.follower_user_id}`))
    }
    response.send(a);
})

//API6
app.get('/tweets/:tweetId/',authenticateToken,async(request,response)=>{
    let {tweetId}=request.params
    let result={}
    let query=`select * from tweet where user_id IN (SELECT DISTINCT follower_user_id FROM follower) AND tweet_id=${tweetId};`
    let execQuery=await db.get(query);
    if(execQuery===undefined){
        response.status(401);
        response.send("Invalid Request")
    }
    else{
        let query1=`SELECT count() as likes FROM like WHERE user_id IN (SELECT DISTINCT follower_user_id FROM follower) AND tweet_id=${tweetId}`
        let query2=`SELECT count() as replies FROM reply WHERE user_id IN (SELECT DISTINCT follower_user_id FROM follower) AND tweet_id=${tweetId}`
        execQuery=await db.get(query);
        result.tweet=execQuery.tweet
        execQuery=await db.get(query1)
        result.likes=execQuery.likes;
        execQuery=await db.get(query2)
        result.replies=execQuery.replies
        execQuery=await db.get(query)
        result.dateTime=execQuery.date_time;
        response.send(result)
    }
    
})
//API 7
app.get('/tweets/:tweetId/likes/',authenticateToken,async(request,response)=>{
    let {tweetId}=request.params
    let result={likes:[]}
    let query=`select * from tweet where user_id IN (SELECT DISTINCT follower_user_id FROM follower) AND tweet_id=${tweetId};`
    let execQuery=await db.get(query);
    if(execQuery===undefined){
        response.status(401);
        response.send("Invalid Request")
    }    
    else{
        query=`SELECT username FROM like INNER JOIN user ON like.user_id=user.user_id WHERE tweet_id=${tweetId} AND user.user_id IN (SELECT DISTINCT follower_user_id FROM follower)`
        execQuery=await db.all(query)
        
        for(let i of execQuery){
            result.likes.push(i.username)
        }
        response.send(result)
    }
})
app.get('/tweets/:tweetId/replies/',authenticateToken,async(request,response)=>{
    let {tweetId}=request.params
    let result={replies:[]}
    let query=`select * from tweet where user_id IN (SELECT DISTINCT follower_user_id FROM follower) AND tweet_id=${tweetId};`
    let execQuery=await db.get(query);
    if(execQuery===undefined){
        response.status(401);
        response.send("Invalid Request")
    }    
    else{
        query=`SELECT name,reply from reply inner join user ON user.user_id=reply.user_id WHERE tweet_id=${tweetId} AND user.user_id IN (SELECT DISTINCT follower_user_id FROM follower)`;
        execQuery=await db.all(query)
        for(let i of execQuery){
            result.replies.push({name:i.name,reply:i.reply})
        }
        response.send(result)
    }
})
app.get('/user/tweets/',authenticateToken,async(request,response)=>{
    let query=`SELECT * FROM tweet ORDER BY user_id`;
    let execQuery=await db.all(query)
    let result=[];
    for(let i of execQuery){
        let out={};
        out.tweet=i.tweet
        let execQuery1=await db.get(`SELECT count(like_id) as likes from like WHERE tweet_id=${i.tweet_id}`)
        let {likes}=execQuery1
        out.likes=likes
        execQuery1=await db.get(`SELECT count(reply) as replies from reply WHERE tweet_id=${i.tweet_id}`)
        let {replies}=execQuery1;
        out.replies=replies;
        out.dateTime=i.date_time;
        result.push(out)       
    }
    response.send(result)
})
module.exports=app;